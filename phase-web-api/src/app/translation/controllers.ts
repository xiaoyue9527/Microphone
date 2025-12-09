import { Request, Response } from 'express';
import logger from '../../logger';
import { ChatSDK, ResponseExtractor } from '../../pkg/agent';
import { env } from '../../config/env';

const TRANSLATION_CONFIGS = {
    product_to_tech: {
        name: '产品需求 → 技术方案分析',
        systemPrompt: `你是一个专业的沟通桥梁，帮助产品经理和技术团队达成共识。

核心职责是将模糊的产品需求转化为清晰的技术分析，而不是直接提供代码解决方案。

在产品经理描述需求时，以下是一些可以帮助你定位问题的澄清问题，确保技术团队能够根据具体场景制定技术方案：

- **用户体验问题：** 请明确当前APP用户体验下降的具体症状，例如：
    - 是否存在明显的卡顿现象？请提供卡顿发生的具体场景或操作。
    - 哪些页面或功能启动缓慢，用户反馈最为强烈？
    - 是否在某些操作中（如页面跳转、按钮点击等）出现明显的延迟或不响应？
    - 用户是否在使用过程中因卡顿、加载慢等问题放弃了操作？

- **具体问题场景：** 请补充以下方面的具体痛点或需求背景：
    - 哪些页面的加载时间过长？（例如首页、商品详情页等）
    - 是否在某些交互场景（例如搜索、支付、跳转等）中出现明显的响应延迟？
    - 当前哪些功能或模块的崩溃率较高？是否存在用户流失的关键环节？

提供了以上的背景信息后，我们可以更好地为你给出可执行的技术方案，分析其中的技术可行性，并估算实施的工作量。

输出结构：
## 需求技术解读
## 可行性评估
## 工作量预估
## 风险识别
## 沟通建议`
    },
    tech_to_product: {
        name: '技术方案 → 业务价值说明',
        systemPrompt: `你是一个专业的沟通桥梁，帮助技术团队向产品经理有效传达技术决策的业务价值。

核心职责是将技术方案转化为产品经理关心的业务影响，而不是讨论技术细节。

在提出技术方案时，技术团队需要澄清方案的具体影响，帮助产品经理理解其对业务目标的贡献。请补充以下方面的细节：
1. **该技术方案如何改善用户体验？** 请描述技术方案如何优化当前的问题，例如提升响应速度、减少卡顿，或是优化页面加载时间。
2. **技术方案是否能够减少用户流失？** 请明确方案如何解决高流失点，是否能优化关键业务流程（如支付、注册等）。
3. **该方案如何提升APP的稳定性？** 是否能有效减少崩溃率，或改善不稳定的功能模块？
4. **预期的开发周期与资源投入是多少？** 请提供该方案的实施时间表和所需资源，包括开发、测试等各阶段的投入。

提供这些信息后，我们将能够更好地展示技术方案带来的业务价值，帮助产品经理理解其对用户体验和业务目标的实际影响。

输出结构：
## 业务价值总结
## 用户体验影响
## 开发周期说明
## 业务收益分析
## 产品建议`
    }
};


// 初始化ChatSDK实例
let chatSDK: ChatSDK;

function getChatSDK(): ChatSDK {
    if (!chatSDK) {
        const { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } = process.env;

        if (!OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY 环境变量未设置');
        }

        chatSDK = new ChatSDK({
            apiKey: OPENAI_API_KEY,
            baseURL: OPENAI_BASE_URL,
            model: OPENAI_MODEL || 'gpt-4o-mini'
        });
    }
    return chatSDK;
}

export const translateController = async (req: Request, res: Response) => {
    const { type, content, options } = req.body;

    try {
        // 正确的 Pino 日志调用方式
        logger.info({
            type,
            contentLength: content.length,
            options
        }, '开始翻译请求');

        // 验证翻译类型
        if (!TRANSLATION_CONFIGS[type as keyof typeof TRANSLATION_CONFIGS]) {
            return res.status(400).json({
                success: false,
                error: '不支持的翻译类型'
            });
        }

        const config = TRANSLATION_CONFIGS[type as keyof typeof TRANSLATION_CONFIGS];
        const sdk = getChatSDK();

        // 更新系统提示
        sdk.updateSystemPrompt(config.systemPrompt);

        // 清空历史记录（保留system提示）
        sdk.clearHistory(true);

        // 调用翻译
        const chatOptions = {
            temperature: options?.temperature || 0.7,
            maxTokens: options?.maxTokens || env.openai.maxTokens
        };

        const response = await sdk.chat(content, chatOptions);

        // 提取回复内容
        const translatedContent = ResponseExtractor.extractContent(response);

        // 正确的 Pino 日志调用方式
        logger.info({
            type,
            contentLength: content.length,
            responseLength: translatedContent.length
        }, '翻译完成');

        res.json({
            success: true,
            data: {
                original: content,
                translated: translatedContent,
                type: type,
                typeName: config.name,
                usage: response.usage
            }
        });

    } catch (error) {
        // 正确的 Pino 错误日志调用方式
        logger.error({
            error: error instanceof Error ? error.message : '未知错误',
            type,
            contentLength: content?.length || 0
        }, '翻译请求失败');

        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : '翻译服务暂时不可用'
        });
    }
};