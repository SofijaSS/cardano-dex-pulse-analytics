export type DataCacheStatus = "hit" | "miss" | "refresh" | "shared" | "stale";

export type DataCacheResult<T> = {
  status: DataCacheStatus;
  value: T;
};

type CacheEntry<T> = {
  expiresAt: number;
  staleUntil: number;
  value: T;
};

export class AsyncDataCache {
  private readonly entries = new Map<string, CacheEntry<unknown>>();
  private readonly pending = new Map<string, Promise<unknown>>();

  async get<T>(
    key: string,
    load: () => Promise<T>,
    {
      force = false,
      staleForMs,
      ttlMs,
    }: {
      force?: boolean;
      staleForMs: number;
      ttlMs: number;
    },
  ): Promise<DataCacheResult<T>> {
    const now = Date.now();
    const cached = this.entries.get(key) as CacheEntry<T> | undefined;

    if (!force && cached && cached.expiresAt > now) {
      return { status: "hit", value: cached.value };
    }

    const active = this.pending.get(key) as Promise<T> | undefined;
    if (active) {
      try {
        return { status: "shared", value: await active };
      } catch (error) {
        if (cached && cached.staleUntil > now) {
          return { status: "stale", value: cached.value };
        }
        throw error;
      }
    }

    const request = Promise.resolve().then(load).then((value) => {
      const loadedAt = Date.now();
      this.entries.set(key, {
        expiresAt: loadedAt + Math.max(0, ttlMs),
        staleUntil: loadedAt + Math.max(0, ttlMs) + Math.max(0, staleForMs),
        value,
      });
      return value;
    });
    this.pending.set(key, request);

    try {
      return {
        status: cached ? "refresh" : "miss",
        value: await request,
      };
    } catch (error) {
      if (cached && cached.staleUntil > now) {
        return { status: "stale", value: cached.value };
      }
      throw error;
    } finally {
      if (this.pending.get(key) === request) this.pending.delete(key);
    }
  }

  clear() {
    this.entries.clear();
    this.pending.clear();
  }
}

export const serverDataCache = new AsyncDataCache();
