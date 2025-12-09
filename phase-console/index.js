import { OpenAI } from 'openai';
import * as dotenv from 'dotenv';
import * as readline from 'readline';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// 加载环境变量
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

// 创建 readline 接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log('OpenAI配置:', {
    apiKey: process.env.OPENAI_API_KEY ? '已设置' : '未设置',
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL
});

// 初始化 OpenAI
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

// 翻译方向映射
const TRANSLATION_TYPES = {
    '1': {
        name: '产品经理 → 开发工程师',
        systemPrompt: `你是一个专业的翻译助手，负责将产品经理的需求描述翻译成开发工程师能理解的技术实现方案。

请按照以下结构进行翻译：
## 需求解析
- 简要总结需求的核心目标

## 技术实现方案
- 详细描述技术实现步骤

## 技术要点
- 列出关键的技术考虑点

## 预估工作量
- 大致评估实现这个需求所需的时间

## 潜在风险
- 识别可能的技术风险

注意：用技术语言描述，避免业务术语。保持回答简洁明了。`
    },
    '2': {
        name: '开发工程师 → 产品经理',
        systemPrompt: `你是一个专业的翻译助手，负责将开发工程师的技术方案翻译成产品经理能理解的业务价值描述。

请按照以下结构进行翻译：
## 功能概述
- 用简单语言描述这个功能是什么

## 用户价值
- 这个功能为用户带来什么价值

## 使用场景
- 在什么情况下用户会用到这个功能

## 体验提升
- 如何提升用户体验

## 业务影响
- 对业务有什么积极影响

注意：用业务语言描述，避免技术术语。保持回答简洁明了。`
    }
};

// 显示菜单
function showMenu() {
    console.log('\n=== 职能沟通翻译助手 ===');
    console.log('请选择翻译方向：');
    Object.entries(TRANSLATION_TYPES).forEach(([key, value]) => {
        console.log(`${key}. ${value.name}`);
    });
    console.log('0. 退出程序');
    console.log('=====================\n');
}

// 获取用户输入
function askQuestion(query) {
    return new Promise(resolve => {
        rl.question(query, answer => {
            resolve(answer);
        });
    });
}

// 调试函数：打印完整的API响应
function debugAPIResponse(completion) {
    console.log('\n=== API响应调试信息 ===');
    console.log('完成原因:', completion.choices[0]?.finish_reason);
    console.log('使用情况:', completion.usage);
    console.log('消息对象键名:', Object.keys(completion.choices[0]?.message || {}));
    console.log('消息内容:', completion.choices[0]?.message?.content);
    console.log('======================\n');
}

// 调用 OpenAI API
async function translateContent(type, content) {
    const config = TRANSLATION_TYPES[type];

    try {
        console.log('\n正在翻译中，请稍候...\n');

        const completion = await openai.chat.completions.create({
            model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
                { role: 'system', content: config.systemPrompt },
                { role: 'user', content: content }
            ],
            max_tokens: parseInt(process.env.DEFAULT_MAX_TOKENS) || 800, // 减少token数量
            temperature: 0.7,
            stream: false
        });

        // 调试信息
        debugAPIResponse(completion);

        // 多种方式尝试获取内容
        let translatedContent = '';
        
        // 方法1: 标准方式
        if (completion.choices[0]?.message?.content) {
            translatedContent = completion.choices[0].message.content;
        }
        // 方法2: 处理可能的其他字段名
        else if (completion.choices[0]?.message?.text) {
            translatedContent = completion.choices[0].message.text;
        }
        // 方法3: 处理直接返回文本的情况
        else if (typeof completion.choices[0]?.text === 'string') {
            translatedContent = completion.choices[0].text;
        }
        // 方法4: 尝试解析整个choices[0]
        else {
            console.log('尝试解析完整响应...');
            translatedContent = JSON.stringify(completion.choices[0], null, 2);
        }

        // 处理内容被截断的情况
        if (completion.choices[0]?.finish_reason === 'length') {
            translatedContent += '\n\n[注意：回答因长度限制被截断，请简化输入内容]';
        }

        return translatedContent || '翻译失败：无法解析API响应内容';

    } catch (error) {
        console.error('调用 OpenAI API 时出错:', error);
        
        // 提供更详细的错误信息
        if (error.response) {
            console.error('API响应错误:', error.response.status, error.response.data);
            return `API错误: ${error.response.status} - ${JSON.stringify(error.response.data)}`;
        } else if (error.code) {
            console.error('错误代码:', error.code);
            return `连接错误: ${error.code} - ${error.message}`;
        }
        
        return `翻译过程中出现错误: ${error.message}`;
    }
}

// 主程序
async function main() {
    console.log('欢迎使用职能沟通翻译助手！\n');

    // 检查API密钥
    if (!process.env.OPENAI_API_KEY) {
        console.error('错误: 未设置 OPENAI_API_KEY 环境变量');
        console.log('请在 .env 文件中设置你的 API 密钥');
        rl.close();
        return;
    }

    while (true) {
        showMenu();

        const choice = await askQuestion('请输入您的选择 (0-2): ');

        if (choice === '0') {
            console.log('\n感谢使用，再见！');
            break;
        }

        if (!TRANSLATION_TYPES[choice]) {
            console.log('无效的选择，请重新输入！\n');
            continue;
        }

        console.log(`\n您选择了: ${TRANSLATION_TYPES[choice].name}`);
        console.log('请输入要翻译的内容（输入"quit"结束输入）：\n');

        let inputLines = [];
        let line = '';

        do {
            line = await askQuestion('> ');
            if (line && line.toLowerCase() !== 'quit') {
                inputLines.push(line);
            }
        } while (line && line.toLowerCase() !== 'quit');

        if (inputLines.length === 0) {
            console.log('没有输入内容，返回菜单...\n');
            continue;
        }

        const inputText = inputLines.join('\n');
        console.log('\n=== 开始翻译 ===');

        const result = await translateContent(choice, inputText);

        console.log('\n=== 翻译结果 ===');
        console.log(result);
        console.log('================\n');

        const continueChoice = await askQuestion('是否继续翻译？(y/n): ');
        if (continueChoice.toLowerCase() !== 'y') {
            console.log('\n感谢使用，再见！');
            break;
        }
    }

    rl.close();
}

// 启动程序
main().catch(error => {
    console.error('程序运行出错:', error);
    rl.close();
});