import { useMemo } from 'react';
import { useStore } from '@/services/store';
import type {
  Activity,
  Booking,
  Checklist,
  Day,
  ExpenseCategory,
  Expense,
  FileAsset,
  ID,
  Intensity,
  Journal,
  Place,
  Trip,
  BudgetSummary,
} from '@/types';
import type { WeatherDay } from '@/types/decision';
import { getPlacesForTrip, resolveCityIds } from '@/data/places';
import { computeDayIntensity, detectConflicts, preparationOf } from '@/services/intelligence';
import { weatherFor } from '@/services/world';

const emptyByCategory = (): Record<ExpenseCategory, { planned: number; paid: number }> => ({
  stay: { planned: 0, paid: 0 },
  transport: { planned: 0, paid: 0 },
  food: { planned: 0, paid: 0 },
  ticket: { planned: 0, paid: 0 },
  shopping: { planned: 0, paid: 0 },
  other: { planned: 0, paid: 0 },
});

export function budgetSummary(trip: Trip, expenses: Expense[]): BudgetSummary {
  const byCategory = emptyByCategory();
  let planned = 0;
  let paid = 0;
  expenses
    .filter((e) => e.tripId === trip.id)
    .forEach((e) => {
      byCategory[e.category][e.status] += e.amount;
      if (e.status === 'paid') paid += e.amount;
      else planned += e.amount;
    });
  const forecast = planned + paid;
  return {
    total: trip.totalBudget,
    planned,
    paid,
    forecast,
    remaining: trip.totalBudget - forecast,
    overrun: Math.max(0, forecast - trip.totalBudget),
    byCategory,
  };
}

export interface TripContext {
  trip: Trip;
  days: Day[];
  activities: Activity[];
  bookings: Booking[];
  expenses: Expense[];
  checklists: Checklist[];
  files: FileAsset[];
  journals: Journal[];
  places: Place[];
  weather: WeatherDay[];
  placeOf: (id?: string) => Place | undefined;
  actsOf: (dayId: ID) => Activity[];
  intensityOf: (day: Day) => Intensity;
  conflicts: ReturnType<typeof detectConflicts>;
  preparation: ReturnType<typeof preparationOf>;
  budget: BudgetSummary;
}

export function useTripContext(tripId: ID | null | undefined): TripContext | null {
  const db = useStore((s) => s.db);
  return useMemo(() => {
    if (!tripId) return null;
    const trip = db.trips.find((t) => t.id === tripId);
    if (!trip) return null;

    const days = db.days.filter((d) => d.tripId === tripId).sort((a, b) => a.index - b.index);
    const activities = db.activities.filter((a) => a.tripId === tripId);
    const bookings = db.bookings.filter((b) => b.tripId === tripId);
    const expenses = db.expenses.filter((e) => e.tripId === tripId);
    const checklists = db.checklists.filter((c) => c.tripId === tripId);
    const files = db.files.filter((f) => f.tripId === tripId);
    const journals = db.journals.filter((j) => j.tripId === tripId);
    // 精编池 + POI 搜索发现的地点合并（多城市：合并所有城市的精编池），保证 poi-xxx 也能被 placeOf 找到
    const curatedPlaces = getPlacesForTrip(trip);
    const cityIds = resolveCityIds(trip);
    const discovered = (db.travelDiscoveredPlaces ?? []).filter((p) =>
      cityIds.includes(p.destinationId),
    );
    const seenIds = new Set(curatedPlaces.map((p) => p.id));
    const places = [...curatedPlaces, ...discovered.filter((p) => !seenIds.has(p.id))];
    const placeOf = (id?: string) => (id ? places.find((p) => p.id === id) : undefined);
    const actsOf = (dayId: ID) =>
      activities
        .filter((a) => a.dayId === dayId)
        .sort((a, b) => a.order - b.order);
    // Phase 0：无真实 WeatherProvider → 空数组（不是假天气）
    const weather = weatherFor(trip.destinationId, days.map((d) => d.date));
    const intensityOf = (day: Day) =>
      day.intensityOverride ?? computeDayIntensity(actsOf(day.id), placeOf).level;
    const conflicts = detectConflicts({
      trip,
      days,
      activities,
      bookings,
      expenses,
      files,
      checklists,
      placeOf,
      weather,
    });
    const preparation = preparationOf(trip, days, activities, bookings, checklists, files);

    return {
      trip,
      days,
      activities,
      bookings,
      expenses,
      checklists,
      files,
      journals,
      places,
      weather,
      placeOf,
      actsOf,
      intensityOf,
      conflicts,
      preparation,
      budget: budgetSummary(trip, expenses),
    };
  }, [db, tripId]);
}

/** 当前旅行：优先 activeTripId，其次最近的旅行中/规划中的旅行 */
export function useCurrentTripId(): ID | null {
  const activeTripId = useStore((s) => s.activeTripId);
  const trips = useStore((s) => s.db.trips);
  return useMemo(() => {
    if (activeTripId && trips.some((t) => t.id === activeTripId)) return activeTripId;
    const order = { traveling: 0, planning: 1, completed: 2 } as const;
    return [...trips].sort((a, b) => order[a.status] - order[b.status])[0]?.id ?? null;
  }, [activeTripId, trips]);
}
