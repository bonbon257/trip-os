/**
 * 状态同步（数据迁到后端）
 * ────────────────────────────────────────────────────────────
 *
 * 工作流程:
 *   1. 浏览器打开 → 自动匿名登录 (POST /api/auth/anon) 拿 JWT cookie
 *   2. hydrate(): 拉 GET /api/state
 *      · 有数据且后端版本匹配 → 让调用方用 fetchState() 拉取后 applyRemoteSnapshot
 *      · 无数据               → 推 PUT (把当前 localStorage 整体上传)
 *   3. 每当 store 变动, debounce 2s 后 PUT 一次
 *
 * 离线容忍:
 *   · 网络失败时保留本地, 下次上线自动重试
 *   · 不做冲突合并 (产品里没有真多端编辑, 个人用户基本一致)
 */
export interface LocalShape {
  state: {
    db: unknown;
    activeTripId: string | null;
    quiz: unknown;
    settings: unknown;
  };
  version: number;
}

const LS_KEY = 'trip-os:v1';
const DEBOUNCE_MS = 2000;
const STORAGE_VERSION = 1;

/** 上传一份完整 state 到后端 */
export async function pushState(snapshot: LocalShape): Promise<{ ok: boolean; bytes?: number; error?: string }> {
  try {
    const res = await fetch('/api/state', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ json: JSON.stringify(snapshot) }),
    });
    const data = (await res.json()) as { ok: boolean; bytes?: number; error?: string };
    return data;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'network' };
  }
}

/** 从后端拉一份 state */
export async function fetchState(): Promise<LocalShape | null> {
  try {
    const res = await fetch('/api/state', {
      method: 'GET',
      credentials: 'include',
    });
    const data = (await res.json()) as { ok: boolean; exists: boolean; json?: string };
    if (!data.ok || !data.exists || !data.json) return null;
    return JSON.parse(data.json) as LocalShape;
  } catch {
    return null;
  }
}

/** 自动匿名登录 */
export async function ensureAuthed(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/anon', {
      method: 'POST',
      credentials: 'include',
    });
    const data = (await res.json()) as { ok: boolean };
    return !!data.ok;
  } catch {
    return false;
  }
}

/** 首次同步：拉远端是否存在 */
export async function hydrateFromBackend(): Promise<'remote' | 'local' | 'fresh'> {
  const remote = await fetchState();
  if (remote && remote.version === STORAGE_VERSION) {
    return 'remote';
  }
  // 远端无数据: 把当前 localStorage 整体推上去 (一次性迁移)
  const lsRaw = localStorage.getItem(LS_KEY);
  if (lsRaw) {
    try {
      const parsed = JSON.parse(lsRaw) as LocalShape;
      if (parsed.version === STORAGE_VERSION) {
        const r = await pushState(parsed);
        return r.ok ? 'local' : 'fresh';
      }
    } catch {
      /* fall-through */
    }
  }
  return 'fresh';
}

/**
 * 把 store 接到后端：每次 state 变动都 debounce 上传。
 */
export function attachSyncToStore(getStore: () => unknown): { detach: () => void } {
  let timer: number | null = null;
  let inflight = false;

  const flush = async () => {
    if (inflight) {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(flush, DEBOUNCE_MS);
      return;
    }
    inflight = true;
    try {
      const s = getStore() as {
        db: unknown;
        activeTripId: string | null;
        quiz: unknown;
        settings: unknown;
      };
      const snapshot: LocalShape = {
        state: {
          db: s.db,
          activeTripId: s.activeTripId,
          quiz: s.quiz,
          settings: s.settings,
        },
        version: STORAGE_VERSION,
      };
      await pushState(snapshot);
    } finally {
      inflight = false;
    }
  };

  const onChange = () => {
    if (timer != null) window.clearTimeout(timer);
    timer = window.setTimeout(flush, DEBOUNCE_MS);
  };

  // zustand store 有 subscribe 方法
  const s = getStore() as { subscribe?: (cb: () => void) => () => void };
  if (typeof s.subscribe !== 'function') {
    return { detach: () => {} };
  }
  const unsub = s.subscribe(onChange);

  return {
    detach: () => {
      if (timer != null) window.clearTimeout(timer);
      unsub();
    },
  };
}

/** 关页面或主动 flush 时调用 */
export async function flushNow(getStore: () => unknown): Promise<void> {
  const s = getStore() as {
    db: unknown;
    activeTripId: string | null;
    quiz: unknown;
    settings: unknown;
  };
  const snapshot: LocalShape = {
    state: {
      db: s.db,
      activeTripId: s.activeTripId,
      quiz: s.quiz,
      settings: s.settings,
    },
    version: STORAGE_VERSION,
  };
  await pushState(snapshot);
}
