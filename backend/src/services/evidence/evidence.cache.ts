/**
 * Process-Local Bounded In-Memory Cache for TasteAudit Qloo Evidence
 *
 * Requirements:
 * - Deterministic cache key (derived from public entity parameters; NEVER secrets)
 * - Bounded TTL (default 5 minutes)
 * - Bounded capacity (default max 100 entries with eviction)
 * - Safe failure mode: cache faults never crash caller
 */

export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  lastAccessed: number;
}

export class BoundedMemoryCache<T> {
  private readonly store = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(maxEntries = 100, ttlMs = 300000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
  }

  /**
   * Generates a deterministic, secret-free cache key.
   */
  public static createKey(entityId: string, entityType?: string, location?: string): string {
    const safeId = (entityId || '').trim().toLowerCase();
    const safeType = (entityType || '').trim().toLowerCase();
    const safeLoc = (location || '').trim().toLowerCase();
    return `ev_${safeId}::${safeType}::${safeLoc}`;
  }

  public get(key: string): T | undefined {
    try {
      const entry = this.store.get(key);
      if (!entry) return undefined;

      const now = Date.now();
      if (now > entry.expiresAt) {
        this.store.delete(key);
        return undefined;
      }

      entry.lastAccessed = now;
      return entry.value;
    } catch {
      return undefined;
    }
  }

  public set(key: string, value: T, customTtlMs?: number): void {
    try {
      const now = Date.now();
      const ttl = customTtlMs ?? this.ttlMs;

      // Evict oldest or expired entries if capacity exceeded
      if (this.store.size >= this.maxEntries) {
        this.evict();
      }

      this.store.set(key, {
        value,
        expiresAt: now + ttl,
        lastAccessed: now
      });
    } catch {
      // Silently ignore cache write faults
    }
  }

  public has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  public clear(): void {
    this.store.clear();
  }

  public size(): number {
    return this.store.size;
  }

  private evict(): void {
    const now = Date.now();
    // Pass 1: Remove already expired entries
    for (const [k, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(k);
      }
    }

    // Pass 2: If still full, evict least recently accessed entry
    if (this.store.size >= this.maxEntries) {
      let oldestKey: string | undefined;
      let oldestTime = Infinity;

      for (const [k, entry] of this.store.entries()) {
        if (entry.lastAccessed < oldestTime) {
          oldestTime = entry.lastAccessed;
          oldestKey = k;
        }
      }

      if (oldestKey) {
        this.store.delete(oldestKey);
      }
    }
  }
}
