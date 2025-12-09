import { promises as fs } from 'fs';
import { join } from 'path';
import { FileStorageConfig } from './types';

export class FileStorage {
    private config: FileStorageConfig;

    constructor(config: FileStorageConfig) {
        this.config = config;
    }

    async loadData(): Promise<Record<string, any>> {
        try {
            const filePath = join(this.config.dataDir, this.config.fileName);
            const data = await fs.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            // 如果文件不存在，返回空对象
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                console.log('数据文件不存在，创建新文件');
                return {};
            }
            console.error('加载数据文件失败:', error);
            throw error;
        }
    }

    async saveData(data: Record<string, any>): Promise<void> {
        try {
            // 确保目录存在
            await fs.mkdir(this.config.dataDir, { recursive: true });
            const filePath = join(this.config.dataDir, this.config.fileName);
            await fs.writeFile(filePath, JSON.stringify(data, null, 2));
        } catch (error) {
            console.error('保存数据文件失败:', error);
            throw error;
        }
    }

    async backupData(): Promise<void> {
        try {
            const filePath = join(this.config.dataDir, this.config.fileName);
            const backupPath = join(this.config.dataDir, `${this.config.fileName}.backup.${Date.now()}`);

            const data = await fs.readFile(filePath, 'utf-8');
            await fs.writeFile(backupPath, data);
        } catch (error) {
            console.error('备份数据失败:', error);
        }
    }

    async getFileInfo(): Promise<{ size: number; exists: boolean; modified: Date }> {
        try {
            const filePath = join(this.config.dataDir, this.config.fileName);
            const stats = await fs.stat(filePath);

            return {
                size: stats.size,
                exists: true,
                modified: stats.mtime
            };
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return { size: 0, exists: false, modified: new Date(0) };
            }
            throw error;
        }
    }
}