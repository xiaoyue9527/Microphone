import { Express, Request, Response, Router } from "express";
import logger from "../logger";
import { translationRouter } from "../app/translation/routes";

interface RouterConf {
    path: string;
    router: Router;
    meta?: any;
}

const routerGroup: RouterConf[] = [
    {
        path: '/api/ai/translation',
        router: translationRouter,
        meta: { description: '职能沟通翻译接口' }
    }
];

function registerRouteGroup(app: Express, routes: RouterConf[]) {
    routes.forEach((route) => {
        app.use(route.path, route.router);
    });
}

function initRoutes(app: Express) {
    logger.info('路由器初始化完成');

    app.get("/", (req: Request, res: Response) => {
        logger.info('根路径访问');
        res.json({
            message: "欢迎使用职能沟通翻译助手 API",
            version: "1.0.0",
            endpoints: routerGroup.map(route => ({
                path: route.path,
                meta: route.meta
            }))
        });
    });

    registerRouteGroup(app, routerGroup);
}

export default initRoutes;