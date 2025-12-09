export interface DatabaseRecord {
  value: any;
  createdAt: number;
  expiresAt?: number;
}

export interface QueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface CacheOptions {
  ttl?: number; // 生存时间（秒）
}

export interface FileStorageConfig {
  dataDir: string;
  fileName: string;
}

// 缓存统计信息
export interface CacheStats {
  total: number;
  expired: number;
  hitRate: number;
  averageTTL: number;
}

// 缓存项接口
export interface CacheItem<T = any> {
  value: T;
  expiresAt?: number;
  createdAt: number;
}