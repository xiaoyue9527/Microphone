import express from 'express';
import logger from './logger';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import initRoutes from './routes';
import path from 'path';
import { WSServer } from './ws/server';

const app = express();
const PORT = env.port;

// 中间件配置
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(pinoHttp({ logger }));

// 静态文件托管
app.use(express.static(path.join(__dirname, '../public')));
app.use('/assets', express.static(path.join(__dirname, '../assets')));

// 健康检查端点
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        environment: env.nodeEnv,
        wsStats: wsServer ? wsServer.getStats() : null
    });
});

// WebSocket统计信息端点
app.get('/ws/stats', (req, res) => {
    if (wsServer) {
        res.json({
            success: true,
            data: wsServer.getStats()
        });
    } else {
        res.json({
            success: false,
            error: 'WebSocket服务器未启动'
        });
    }
});

// 初始化路由
initRoutes(app);

// 提供前端页面的路由
app.get('/demo', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/demo.html'));
});

app.get('/test', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/test.html'));
});

app.get('/chat', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/chat.html'));
});

// Express 5 全局错误处理中间件
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error({
        message: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method,
        ip: req.ip
    }, '全局错误处理');

    // 根据错误类型返回不同的状态码
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            error: '请求参数验证失败',
            details: error.message
        });
    }

    if (error.message.includes('API密钥') || error.message.includes('OpenAI')) {
        return res.status(503).json({
            success: false,
            error: 'AI服务暂时不可用，请检查配置'
        });
    }

    res.status(500).json({
        success: false,
        error: env.nodeEnv === 'production'
            ? '内部服务器错误'
            : error.message
    });
});

// 创建HTTP服务器
const server = app.listen(PORT, () => {
    logger.info(`🚀 职能沟通翻译助手 API 服务已启动 (Express 5)`);
    logger.info(`📍 服务地址: http://localhost:${PORT}`);
    logger.info(`📱 测试页面: http://localhost:${PORT}/demo`);
    logger.info(`💬 聊天室: http://localhost:${PORT}/chat`);
    logger.info(`🧪 接口测试: http://localhost:${PORT}/test`);
    logger.info(`🏷️ 环境: ${env.nodeEnv}`);
});

// 启动WebSocket服务器
let wsServer: WSServer;
try {
    const wsPort = parseInt(process.env.WS_PORT || '8080');
    wsServer = new WSServer(wsPort);
    logger.info(`🔌 WebSocket服务器启动在端口 ${wsPort}`);
} catch (error: any) {
    logger.error('启动WebSocket服务器失败:', error);
}

// 优雅关闭
process.on('SIGINT', () => {
    logger.info('收到 SIGINT 信号，开始优雅关闭...');

    if (wsServer) {
        wsServer.close();
    }

    server.close(() => {
        logger.info('HTTP服务器已关闭');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    logger.info('收到 SIGTERM 信号，开始优雅关闭...');

    if (wsServer) {
        wsServer.close();
    }

    server.close(() => {
        logger.info('HTTP服务器已关闭');
        process.exit(0);
    });
});

// 未处理拒绝和未捕获异常的全局处理
process.on('unhandledRejection', (reason, promise) => {
    logger.error({ reason, promise }, '未处理的 Promise 拒绝');
});

process.on('uncaughtException', (error) => {
    logger.error(error, '未捕获的异常');
    process.exit(1);
});