import { CacheOptions } from './types';

interface CacheItem<T = any> {
  value: T;
  expiresAt?: number;
  createdAt: number;
}

export class CacheManager {
  private cache: Map<string, CacheItem> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs: number = 5 * 60 * 1000) { // 默认5分钟清理一次
    this.startCleanup(cleanupIntervalMs);
  }

  set<T>(key: string, value: T, ttl?: number): void {
    const cacheItem: CacheItem<T> = {
      value,
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl * 1000 : undefined
    };

    this.cache.set(key, cacheItem);
  }

  get<T>(key: string): T | null {
    const item = this.cache.get(key) as CacheItem<T> | undefined;
    
    if (!item) {
      return null;
    }

    // 检查是否过期
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }

    return item.value;
  }

  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: string): boolean {
    const item = this.cache.get(key);
    if (!item) return false;
    
    if (item.expiresAt && item.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }

  size(): number {
    this.cleanup(); // 先清理过期项目
    return this.cache.size;
  }

  keys(): string[] {
    this.cleanup(); // 先清理过期项目
    return Array.from(this.cache.keys());
  }

  stats(): {
    total: number;
    expired: number;
    hitRate: number;
    averageTTL: number;
  } {
    const now = Date.now();
    let total = 0;
    let expired = 0;
    let totalTTL = 0;
    let itemsWithTTL = 0;

    for (const [key, item] of this.cache.entries()) {
      total++;
      if (item.expiresAt && item.expiresAt < now) {
        expired++;
        this.cache.delete(key);
      } else if (item.expiresAt) {
        totalTTL += item.expiresAt - item.createdAt;
        itemsWithTTL++;
      }
    }

    const validItems = total - expired;
    const hitRate = validItems > 0 ? (validItems / total) * 100 : 0;
    const averageTTL = itemsWithTTL > 0 ? totalTTL / itemsWithTTL : 0;

    return {
      total: validItems,
      expired,
      hitRate,
      averageTTL
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt && item.expiresAt < now) {
        this.cache.delete(key);
      }
    }
  }

  private startCleanup(intervalMs: number): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMs);
  }

  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  // 序列化缓存（用于持久化）
  serialize(): Record<string, CacheItem> {
    this.cleanup(); // 先清理过期项目
    return Object.fromEntries(this.cache);
  }

  // 从序列化数据恢复缓存
  deserialize(data: Record<string, CacheItem>): void {
    this.cache.clear();
    const now = Date.now();
    
    for (const [key, item] of Object.entries(data)) {
      // 只恢复未过期的项目
      if (!item.expiresAt || item.expiresAt > now) {
        this.cache.set(key, item);
      }
    }
  }
}