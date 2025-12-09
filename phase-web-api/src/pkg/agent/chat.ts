import { OpenAI } from 'openai';
import {
  ChatCompletionMessage,
  ChatCompletionSystemMessageParam,
  ChatCompletionUserMessageParam,
  ChatCompletionAssistantMessageParam
} from 'openai/resources/chat/completions';
import { ChatHistory, ChatOptions, OpenAIConfig, ChatMessage } from './types';
import { env } from '../../config/env';

/**
 * 大模型回复内容提取器
 */
class ResponseExtractor {
  /**
   * 从完整的API响应对象中提取文本内容
   */
  static extractContent(completion: any): string {
    if (!completion || !completion.choices || completion.choices.length === 0) {
      throw new Error('无效的API响应: choices为空');
    }

    const firstChoice = completion.choices[0];

    if (!firstChoice) {
      throw new Error('无效的API响应: 第一个choice不存在');
    }

    // 方法1: 标准方式获取内容
    if (firstChoice.message?.content) {
      return firstChoice.message.content;
    }

    // 方法2: 处理可能的其他字段名
    if ((firstChoice.message as any)?.text) {
      return (firstChoice.message as any).text;
    }

    // 方法3: 处理直接返回文本的情况（某些API变体）
    if (typeof (firstChoice as any).text === 'string') {
      return (firstChoice as any).text;
    }

    // 方法4: 尝试从delta中提取（流式响应）
    if ((firstChoice as any).delta?.content) {
      return (firstChoice as any).delta.content;
    }

    // 如果所有方法都失败，抛出详细错误
    console.warn('无法解析的响应结构:', JSON.stringify(completion, null, 2));
    throw new Error(`无法提取回复内容。完成原因: ${firstChoice.finish_reason}`);
  }

  /**
   * 安全提取内容（不抛出异常，返回默认值）
   */
  static safeExtract(completion: any, defaultValue: string = '抱歉，无法获取回复内容。'): string {
    try {
      return this.extractContent(completion);
    } catch (error) {
      console.error('提取回复内容失败:', error);
      return defaultValue;
    }
  }
}

/**
 * 对话SDK - 负责管理对话历史和调用AI模型
 */
export class ChatSDK {
  private openai: OpenAI;
  private history: ChatHistory;
  private defaultOptions: ChatOptions;

  constructor(config: OpenAIConfig, systemPrompt?: string) {
    // 初始化OpenAI客户端
    this.openai = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL,
    });

    // 初始化对话历史
    this.history = {
      messages: systemPrompt ? [
        {
          role: 'system',
          content: systemPrompt,
          timestamp: Date.now()
        }
      ] : [],
      maxLength: 20 // 默认保存最近20条消息
    };

    // 默认聊天选项
    this.defaultOptions = {
      model: config.model || 'gpt-4o-mini',
      temperature: 0.7,
      maxTokens: 2048,
      stream: false
    };
  }

  /**
   * 添加消息到历史记录
   */
  private addMessage(role: ChatMessage['role'], content: string): void {
    const message: ChatMessage = {
      role,
      content,
      timestamp: Date.now()
    };

    this.history.messages.push(message);

    // 限制历史记录长度
    if (this.history.maxLength && this.history.messages.length > this.history.maxLength) {
      // 保留system消息和最近的消息
      const systemMessage = this.history.messages.find(msg => msg.role === 'system');
      const otherMessages = this.history.messages
        .filter(msg => msg.role !== 'system')
        .slice(-this.history.maxLength + (systemMessage ? 1 : 0));

      this.history.messages = systemMessage
        ? [systemMessage, ...otherMessages]
        : otherMessages;
    }
  }

  /**
   * 将自定义消息类型转换为OpenAI SDK需要的消息类型
   */
  private convertToOpenAIMessage(msg: ChatMessage):
    | ChatCompletionSystemMessageParam
    | ChatCompletionUserMessageParam
    | ChatCompletionAssistantMessageParam {

    switch (msg.role) {
      case 'system':
        return { role: 'system', content: msg.content } as ChatCompletionSystemMessageParam;
      case 'user':
        return { role: 'user', content: msg.content } as ChatCompletionUserMessageParam;
      case 'assistant':
        return { role: 'assistant', content: msg.content } as ChatCompletionAssistantMessageParam;
      default:
        // 默认处理为user消息
        return { role: 'user', content: msg.content } as ChatCompletionUserMessageParam;
    }
  }

  /**
   * 获取格式化后的消息列表（用于API调用）
   */
  private getFormattedMessages(): Array<
    | ChatCompletionSystemMessageParam
    | ChatCompletionUserMessageParam
    | ChatCompletionAssistantMessageParam
  > {
    return this.history.messages.map(msg => this.convertToOpenAIMessage(msg));
  }

  /**
   * 核心聊天方法
   */
  async chat(userInput: string, options?: Partial<ChatOptions>): Promise<any> {
    // 添加用户消息到历史记录
    this.addMessage('user', userInput);

    // 合并选项
    const chatOptions = { ...this.defaultOptions, ...options };

    try {
      console.log('发送消息到OpenAI API...');

      // 调用OpenAI API
      const completion = await this.openai.chat.completions.create({
        model: chatOptions.model!,
        messages: this.getFormattedMessages(),
        temperature: chatOptions.temperature,
        max_tokens: chatOptions.maxTokens,
        stream: chatOptions.stream
      });

      console.log('OpenAI API响应成功');

      // 提取助手回复并添加到历史记录
      const assistantContent = ResponseExtractor.extractContent(completion);
      if (assistantContent) {
        this.addMessage('assistant', assistantContent);
      }

      return completion;
    } catch (error) {
      console.error('Chat API调用失败:', error);

      // 提供更详细的错误信息
      if ((error as any).response) {
        console.error('API响应错误:', (error as any).response.status, (error as any).response.data);
        throw new Error(`API错误: ${(error as any).response.status} - ${JSON.stringify((error as any).response.data)}`);
      } else if ((error as any).code) {
        console.error('错误代码:', (error as any).code);
        throw new Error(`连接错误: ${(error as any).code} - ${(error as any).message}`);
      }

      throw new Error(`聊天失败: ${error instanceof Error ? error.message : '未知错误'}`);
    }
  }

  /**
   * 获取当前对话历史
   */
  getHistory(): ChatMessage[] {
    return [...this.history.messages];
  }

  /**
   * 清空对话历史（可选择性保留system提示）
   */
  clearHistory(keepSystemPrompt: boolean = true): void {
    if (keepSystemPrompt) {
      const systemMessage = this.history.messages.find(msg => msg.role === 'system');
      this.history.messages = systemMessage ? [systemMessage] : [];
    } else {
      this.history.messages = [];
    }
  }

  /**
   * 更新system提示
   */
  updateSystemPrompt(systemPrompt: string): void {
    const existingSystemIndex = this.history.messages.findIndex(msg => msg.role === 'system');

    if (existingSystemIndex >= 0) {
      // 更新现有system消息
      this.history.messages[existingSystemIndex].content = systemPrompt;
      this.history.messages[existingSystemIndex].timestamp = Date.now();
    } else {
      // 添加新的system消息到开头
      this.history.messages.unshift({
        role: 'system',
        content: systemPrompt,
        timestamp: Date.now()
      });
    }
  }

  /**
   * 设置历史记录最大长度
   */
  setMaxHistoryLength(maxLength: number): void {
    this.history.maxLength = maxLength;
  }

  /**
   * 获取对话统计信息
   */
  getStats() {
    const stats = {
      totalMessages: this.history.messages.length,
      systemMessages: this.history.messages.filter(m => m.role === 'system').length,
      userMessages: this.history.messages.filter(m => m.role === 'user').length,
      assistantMessages: this.history.messages.filter(m => m.role === 'assistant').length,
      oldestMessage: this.history.messages.length > 0
        ? new Date(Math.min(...this.history.messages.map(m => m.timestamp || 0)))
        : null,
      newestMessage: this.history.messages.length > 0
        ? new Date(Math.max(...this.history.messages.map(m => m.timestamp || 0)))
        : null
    };

    return stats;
  }
}

// 导出ResponseExtractor供外部使用
export { ResponseExtractor };