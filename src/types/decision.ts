import type { Destination, Intensity, TransportMode } from './index';

export type TravelTypeCode =
  | 'relaxed'
  | 'efficient'
  | 'wanderer'
  | 'freeSpirit'
  | 'comfort'
  | 'social';

export interface TravelTypeResult {
  code: TravelTypeCode;
  name: string;
  emoji: string;
  tagline: string;
  /** 均为 0–100，用于雷达条 */
  metrics: {
    planning: number;
    intensity: number;
    freedom: number;
    spontaneity: number;
  };
  fit: string[];
  avoid: string[];
}

export interface ScoreFactor {
  key: string;
  label: string;
  weight: number;
  /** 0–1 该单项得分 */
  score: number;
  note: string;
}

export interface ScoredDestination {
  destination: Destination;
  /** 0–100 综合匹配度 */
  score: number;
  factors: ScoreFactor[];
  reasons: string[];
  cautions: string[];
  estBudget: { low: number; high: number };
  suggestDays: number;
  transport: { hours: number; cost: number; mode: TransportMode };
  seasonNote: string;
  intensity: Intensity;
}

export interface WeatherDay {
  date: string;
  high: number;
  low: number;
  condition: 'sunny' | 'cloudy' | 'rain' | 'shower';
  emoji: string;
  text: string;
  /** 降雨概率 0–100 */
  rain: number;
}

export interface TripTemplate {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  days: number;
  budget: number;
  destinationId: string;
  pace: string;
}

export interface Inspiration {
  id: string;
  emoji: string;
  title: string;
  desc: string;
  destinationId: string;
}
