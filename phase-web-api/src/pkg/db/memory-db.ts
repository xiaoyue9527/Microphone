import { CacheManager } from "./cache";
import { FileStorage } from "./file-storage";
import { DatabaseRecord, CacheOptions } from "./types";


export class MemoryDatabase<T = any> {
    private data: Map<string, DatabaseRecord> = new Map();
    private fileStorage: FileStorage;
    private cache: CacheManager;

    constructor(dataDir: string, fileName: string = 'data.json') {
        this.fileStorage = new FileStorage({ dataDir, fileName });
        this.cache = new CacheManager();
        this.loadFromFile().catch(console.error);
    }

    async set(key: string, value: T, options?: CacheOptions): Promise<void> {
        const record: DatabaseRecord = {
            value,
            createdAt: Date.now(),
            expiresAt: options?.ttl ? Date.now() + options.ttl * 1000 : undefined
        };

        this.data.set(key, record);
        this.cache.set(key, value, options?.ttl);
        await this.saveToFile();
    }

    async get<T>(key: string): Promise<T | null> {
        // 先查缓存
        const cached = this.cache.get<T>(key);
        if (cached) return cached;

        const record = this.data.get(key);
        if (!record) return null;

        // 检查过期
        if (record.expiresAt && record.expiresAt < Date.now()) {
            await this.delete(key);
            return null;
        }

        this.cache.set(key, record.value);
        return record.value as T;
    }

    async delete(key: string): Promise<boolean> {
        const existed = this.data.delete(key);
        this.cache.delete(key);
        if (existed) {
            await this.saveToFile();
        }
        return existed;
    }

    async exists(key: string): Promise<boolean> {
        const record = this.data.get(key);
        if (!record) return false;

        if (record.expiresAt && record.expiresAt < Date.now()) {
            await this.delete(key);
            return false;
        }

        return true;
    }

    async keys(): Promise<string[]> {
        // 清理过期键
        const now = Date.now();
        for (const [key, record] of this.data.entries()) {
            if (record.expiresAt && record.expiresAt < now) {
                await this.delete(key);
            }
        }

        return Array.from(this.data.keys());
    }

    async clear(): Promise<void> {
        this.data.clear();
        this.cache.clear();
        await this.saveToFile();
    }

    private async loadFromFile(): Promise<void> {
        try {
            const data = await this.fileStorage.loadData();
            if (data && typeof data === 'object') {
                this.data = new Map(Object.entries(data));
            }
        } catch (error) {
            console.warn('Failed to load data from file, starting with empty database:', error);
        }
    }

    private async saveToFile(): Promise<void> {
        try {
            const data = Object.fromEntries(this.data);
            await this.fileStorage.saveData(data);
        } catch (error) {
            console.error('Failed to save data to file:', error);
        }
    }
}