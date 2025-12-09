import dotenv from 'dotenv';
import path from 'path';

// 加载环境变量 - 使用 process.cwd() 替代 import.meta
dotenv.config({
    path: path.join(process.cwd(), '.env')
});

export const env = {
    port: process.env.PORT || 3000,
    openai: {
        apiKey: process.env.OPENAI_API_KEY,
        baseURL: process.env.OPENAI_BASE_URL,
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        maxTokens: Number(process.env.DEFAULT_MAX_TOKENS || '2048') || 2048,
    },
    nodeEnv: process.env.NODE_ENV || 'development'
};

// 验证必要环境变量
if (!env.openai.apiKey) {
    throw new Error('OPENAI_API_KEY 环境变量是必需的');
}