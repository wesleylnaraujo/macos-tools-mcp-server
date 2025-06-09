import NodeCache from "node-cache";

interface CacheConfig {
  stdTTL: number;
  checkperiod: number;
  maxKeys?: number;
}

class PerformanceCache {
  private cache: NodeCache;
  
  constructor(config: CacheConfig) {
    this.cache = new NodeCache({
      stdTTL: config.stdTTL,
      checkperiod: config.checkperiod,
      maxKeys: config.maxKeys || 1000,
      useClones: false,
    });
  }
  
  async get<T>(key: string, fetcher: () => Promise<T>, ttl?: number): Promise<T> {
    const cached = this.cache.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }
    
    const data = await fetcher();
    if (ttl !== undefined) {
      this.cache.set(key, data, ttl);
    } else {
      this.cache.set(key, data);
    }
    return data;
  }
  
  set(key: string, value: any, ttl?: number): boolean {
    if (ttl !== undefined) {
      return this.cache.set(key, value, ttl);
    } else {
      return this.cache.set(key, value);
    }
  }
  
  del(key: string): number {
    return this.cache.del(key);
  }
  
  flush(): void {
    this.cache.flushAll();
  }
  
  getStats() {
    return this.cache.getStats();
  }
}

// Cache instances for different purposes
export const systemMetricsCache = new PerformanceCache({
  stdTTL: 5, // 5 seconds for real-time metrics
  checkperiod: 10,
});

export const processListCache = new PerformanceCache({
  stdTTL: 3, // 3 seconds for process lists
  checkperiod: 5,
});

export const searchIndexCache = new PerformanceCache({
  stdTTL: 300, // 5 minutes for search results
  checkperiod: 60,
  maxKeys: 500,
});

export const fileTagsCache = new PerformanceCache({
  stdTTL: 600, // 10 minutes for file tags
  checkperiod: 120,
  maxKeys: 2000,
});

// Helper to create cache key from complex objects
export function createCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedKeys = Object.keys(params).sort();
  const keyParts = sortedKeys
    .filter(key => params[key] !== undefined)
    .map(key => `${key}:${JSON.stringify(params[key])}`);
  
  return `${prefix}:${keyParts.join(",")}`;
}

// Debounce helper for expensive operations
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function (...args: Parameters<T>) {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Rate limiter for API calls
export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;
  
  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
  }
  
  async checkLimit(): Promise<boolean> {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.windowMs);
    
    if (this.requests.length >= this.maxRequests) {
      return false;
    }
    
    this.requests.push(now);
    return true;
  }
  
  async waitForSlot(): Promise<void> {
    while (!(await this.checkLimit())) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}