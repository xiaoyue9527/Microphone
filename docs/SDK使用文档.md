# 职能沟通翻译助手

## 概述
ChatSDK 和 Web API 的使用说明。

## 核心功能

### 1. ChatSDK（对话SDK）

**位置：** `src/pkg/agent/`

#### 基本使用

```typescript
import { ChatSDK, ResponseExtractor } from './src/pkg/agent';

// 初始化
const sdk = new ChatSDK({
  apiKey: process.env.OPENAI_API_KEY!,
  baseURL: process.env.OPENAI_BASE_URL,  // 注意：小写URL
  model: process.env.OPENAI_MODEL || 'gpt-4o-mini'
});

// 简单对话
const response = await sdk.chat('用户输入内容');
const content = ResponseExtractor.extractContent(response);
console.log(content);
```

#### 完整示例

```typescript
import { ChatSDK, ResponseExtractor } from './src/pkg/agent';

class TranslationService {
  private sdk: ChatSDK;

  constructor() {
    this.sdk = new ChatSDK({
      apiKey: 'your-api-key-here',
      baseURL: 'https://api.openai.com/v1',  // 注意：小写URL
      model: 'gpt-4o-mini'
    }, '可选的系统提示语');  // 可选的第二个参数：系统提示
  }

  // 产品需求转技术方案
  async productToTech(requirement: string) {
    const systemPrompt = `你是一个专业的沟通桥梁，帮助产品经理和技术团队达成共识...`;
    
    this.sdk.updateSystemPrompt(systemPrompt);
    this.sdk.clearHistory(true);  // 保留系统提示，清空对话记录
    
    const response = await this.sdk.chat(requirement, {
      temperature: 0.7,
      maxTokens: 2048
    });
    
    return ResponseExtractor.extractContent(response);
  }

  // 技术方案转产品价值
  async techToProduct(solution: string) {
    const systemPrompt = `你是一个专业的沟通桥梁，帮助技术团队向产品经理有效传达技术决策的业务价值...`;
    
    this.sdk.updateSystemPrompt(systemPrompt);
    this.sdk.clearHistory(true);
    
    const response = await this.sdk.chat(solution);
    return ResponseExtractor.extractContent(response);
  }

  // 安全提取内容（不抛出异常）
  safeExtract(response: any, defaultValue: string = '默认回复') {
    return ResponseExtractor.safeExtract(response, defaultValue);
  }

  // 管理历史记录长度
  setHistoryLimit(limit: number) {
    this.sdk.setMaxHistoryLength(limit);
  }

  // 获取对话历史
  getHistory() {
    return this.sdk.getHistory();
  }
}

// 使用示例
const service = new TranslationService();
const result = await service.productToTech('需要优化APP首页加载速度');
console.log(result);
```

### 2. Web API 使用

#### 启动服务

```bash
cd phase-web-api
npm install
npm run dev          # 开发模式
npm run build        # 构建
npm start           # 生产模式
```

服务启动在 http://localhost:3000

#### API 端点

**POST /api/ai/translation/translate**

请求体：
```json
{
  "type": "product_to_tech", // 或 "tech_to_product"
  "content": "需要翻译的内容",
  "options": {
    "temperature": 0.7,
    "maxTokens": 2048
  }
}
```

响应：
```json
{
  "success": true,
  "data": {
    "original": "原始内容",
    "translated": "翻译结果",
    "type": "product_to_tech",
    "typeName": "产品需求 → 技术方案分析",
    "usage": {
      "prompt_tokens": 100,
      "completion_tokens": 200,
      "total_tokens": 300
    }
  }
}
```

#### 前端调用示例

```javascript
// 使用 fetch API
async function translateContent(type, content, options = {}) {
  try {
    const response = await fetch('/api/ai/translation/translate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: type,
        content: content,
        options: options
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP错误: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    console.error('翻译失败:', error);
    throw error;
  }
}

// 使用示例
translateContent('product_to_tech', '需要优化用户体验', { temperature: 0.8 })
  .then(data => {
    console.log('翻译结果:', data.translated);
    console.log('Token使用:', data.usage);
  })
  .catch(error => {
    console.error('错误:', error);
  });
```

### 3. 可用的前端页面

服务启动后访问：
- **演示页面：** http://localhost:3000/demo
- **测试页面：** http://localhost:3000/test  
- **聊天室：** http://localhost:3000/chat
- **健康检查：** http://localhost:3000/health

### 4. WebSocket 实时通信

#### 服务端使用

```typescript
import { WSServer } from './src/ws/server';

// 启动WebSocket服务器（默认端口8080）
const wsServer = new WSServer(8080);
```

#### 客户端连接

```javascript
// 浏览器端
const ws = new WebSocket('ws://localhost:8080');

// 连接建立
ws.onopen = () => {
  // 加入房间
  ws.send(JSON.stringify({
    type: 'join_room',
    payload: {
      roomName: 'project-room',
      userName: '张三',
      userRole: 'product_manager' // 或 'developer'
    }
  }));
};

// 接收消息
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  switch (message.type) {
    case 'connection_established':
      console.log('连接建立，用户ID:', message.payload.userId);
      break;
      
    case 'room_joined':
      console.log('加入房间成功:', message.payload.roomName);
      break;
      
    case 'user_joined':
      console.log('用户加入:', message.payload.user.name);
      break;
      
    case 'chat_message':
      const msg = message.payload.message;
      console.log(`[${msg.userName}(${msg.userRole})]: ${msg.content}`);
      break;
      
    case 'user_list':
      console.log('在线用户:', message.payload.users);
      break;
      
    case 'user_left':
      console.log('用户离开:', message.payload.user.name);
      break;
  }
};

// 发送聊天消息
function sendMessage(content) {
  ws.send(JSON.stringify({
    type: 'chat_message',
    payload: { content: content }
  }));
}

// 离开房间
function leaveRoom() {
  ws.send(JSON.stringify({
    type: 'leave_room'
  }));
}

// 请求用户列表
function requestUsers() {
  ws.send(JSON.stringify({
    type: 'list_users'
  }));
}

// 错误处理
ws.onerror = (error) => {
  console.error('WebSocket错误:', error);
};

ws.onclose = (event) => {
  console.log('连接关闭:', event.code, event.reason);
};
```

## 配置说明

### 环境变量 (.env)

```env
# OpenAI配置
OPENAI_API_KEY=sk-your-api-key-here
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
DEFAULT_MAX_TOKENS=2048

# 服务器配置
PORT=3000
WS_PORT=8080
NODE_ENV=development

# 日志配置
LOG_LEVEL=info
```

### ChatSDK 完整配置选项

```typescript
// 初始化配置
interface OpenAIConfig {
  apiKey: string;           // 必需：OpenAI API密钥
  baseURL?: string;         // 可选：API基础URL（注意小写）
  model?: string;           // 可选：模型名称
}

// 聊天选项
interface ChatOptions {
  model?: string;           // 模型名称
  temperature?: number;     // 温度参数 (0-1)，默认0.7
  maxTokens?: number;       // 最大token数，默认2048
  stream?: boolean;         // 是否流式输出，默认false
}
```

## 错误处理

### ChatSDK 错误处理

```typescript
try {
  const response = await sdk.chat('输入内容');
  
  // 标准提取（可能抛出异常）
  const content = ResponseExtractor.extractContent(response);
  
  // 或者使用安全提取（不抛出异常）
  const safeContent = ResponseExtractor.safeExtract(response, '默认回复内容');
  
} catch (error) {
  if (error.message.includes('API密钥') || error.message.includes('OPENAI_API_KEY')) {
    console.error('❌ API密钥配置错误，请检查OPENAI_API_KEY环境变量');
  } else if (error.message.includes('网络') || error.message.includes('连接')) {
    console.error('🌐 网络连接失败，请检查网络设置和API端点');
  } else if (error.message.includes('token') || error.message.includes('长度')) {
    console.error('📝 输入内容过长，请简化输入或调整maxTokens参数');
  } else if (error.message.includes('无法提取回复内容')) {
    console.error('🔍 API响应格式异常，无法提取内容');
  } else {
    console.error('⚠️ 未知错误:', error.message);
  }
}
```

### API 调用错误处理

```javascript
async function safeTranslate(type, content, options = {}) {
  try {
    const response = await fetch('/api/ai/translation/translate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ 
        type, 
        content, 
        options 
      })
    });
    
    // 检查HTTP状态
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || '翻译服务返回错误');
    }
    
    return result.data;
    
  } catch (error) {
    console.error('翻译失败:', error);
    
    // 用户友好的错误提示
    if (error.message.includes('500') || error.message.includes('503')) {
      throw new Error('服务器暂时不可用，请稍后重试');
    } else if (error.message.includes('400')) {
      throw new Error('请求参数错误，请检查输入内容');
    } else if (error.message.includes('fetch') || error.message.includes('Network')) {
      throw new Error('网络连接失败，请检查网络设置');
    } else {
      throw new Error(`翻译失败: ${error.message}`);
    }
  }
}

// 使用示例
safeTranslate('product_to_tech', '需要优化的需求')
  .then(data => console.log('成功:', data))
  .catch(error => {
    // 显示用户友好的错误信息
    alert(error.message);
  });
```

### WebSocket 错误处理

```javascript
// 自动重连机制
class ReconnectableWebSocket {
  constructor(url, options = {}) {
    this.url = url;
    this.options = options;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectInterval = 3000;
    
    this.connect();
  }
  
  connect() {
    try {
      this.ws = new WebSocket(this.url);
      this.setupEventHandlers();
    } catch (error) {
      console.error('创建WebSocket失败:', error);
      this.scheduleReconnect();
    }
  }
  
  setupEventHandlers() {
    this.ws.onopen = () => {
      console.log('WebSocket连接成功');
      this.reconnectAttempts = 0;
      this.onOpen && this.onOpen();
    };
    
    this.ws.onmessage = (event) => {
      this.onMessage && this.onMessage(event);
    };
    
    this.ws.onerror = (error) => {
      console.error('WebSocket错误:', error);
      this.onError && this.onError(error);
    };
    
    this.ws.onclose = (event) => {
      console.log('WebSocket连接关闭:', event.code, event.reason);
      
      if (event.code !== 1000) { // 非正常关闭
        this.scheduleReconnect();
      }
      
      this.onClose && this.onClose(event);
    };
  }
  
  scheduleReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`尝试重连 (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectInterval);
    } else {
      console.error('达到最大重连次数，停止重连');
    }
  }
  
  send(data) {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(data);
    } else {
      console.error('WebSocket未连接，无法发送消息');
    }
  }
}

// 使用自动重连的WebSocket
const ws = new ReconnectableWebSocket('ws://localhost:8080');
ws.onOpen = () => {
  // 连接建立后的逻辑
  ws.send(JSON.stringify({
    type: 'join_room',
    payload: { roomName: 'test', userName: '用户', userRole: 'developer' }
  }));
};
```

## 实用工具

### 健康检查

```bash
# 检查服务状态
curl http://localhost:3000/health

# 响应示例
{
  "status": "OK",
  "timestamp": "2025-12-10T03:37:39.123Z",
  "environment": "development",
  "wsStats": {
    "totalUsers": 5,
    "totalRooms": 2
  }
}

# 检查WebSocket状态
curl http://localhost:3000/ws/stats

# 响应示例
{
  "success": true,
  "data": {
    "totalUsers": 5,
    "totalRooms": 2,
    "rooms": [
      {
        "id": "room-1",
        "name": "项目讨论室",
        "userCount": 3
      }
    ]
  }
}
```

### 高级 ChatSDK 功能

```typescript
// 1. 流式输出处理
async function streamChat(sdk: ChatSDK, input: string) {
  const response = await sdk.chat(input, { stream: true });
  
  // 处理流式响应（需要根据实际API调整）
  for await (const chunk of response) {
    process.stdout.write(chunk.choices[0]?.delta?.content || '');
  }
}

// 2. 自定义历史记录管理
const sdk = new ChatSDK({ apiKey: 'key' });
sdk.setMaxHistoryLength(10);  // 只保留最近10条消息

// 手动添加消息到历史
// sdk.addMessage('user', '用户消息'); // 注意：此方法在代码中存在但文档未提及

// 3. 获取对话统计
const history = sdk.getHistory();
console.log('对话轮数:', history.length);
console.log('最后消息:', history[history.length - 1]);

// 4. 完全重置对话
sdk.clearHistory();  // 清空所有记录，包括系统提示
```

### 性能监控

```javascript
// API调用性能监控
async function monitoredTranslate(type, content) {
  const startTime = Date.now();
  
  try {
    const data = await translateContent(type, content);
    const duration = Date.now() - startTime;
    
    console.log(`翻译完成，耗时: ${duration}ms`);
    console.log(`Token使用: ${data.usage.total_tokens}`);
    
    return data;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`翻译失败，耗时: ${duration}ms`, error);
    throw error;
  }
}
```

## 注意事项

1. **API密钥安全：** 永远不要在前端代码中硬编码API密钥，使用环境变量
2. **Token限制：** 注意输入内容长度，避免超出模型限制
3. **错误处理：** 所有API调用都要有适当的错误处理
4. **网络超时：** 为API调用设置合理的超时时间
5. **重试机制：** 对于临时性错误实现适当的重试逻辑
6. **速率限制：** 注意API的速率限制，避免频繁请求

## 故障排除

### 常见问题

1. **"API密钥未设置"错误**
   - 检查 `.env` 文件中的 `OPENAI_API_KEY`
   - 确认环境变量已正确加载

2. **网络连接失败**
   - 检查防火墙设置
   - 验证 `OPENAI_BASE_URL` 是否正确
   - 确认网络可以访问API端点

3. **响应内容截断**
   - 增加 `maxTokens` 参数
   - 简化输入内容长度

4. **WebSocket连接失败**
   - 确认WebSocket服务器端口（默认8080）未被占用
   - 检查防火墙设置

5. **内容提取失败**
   - 使用 `ResponseExtractor.safeExtract()` 替代 `extractContent()`
   - 检查API响应格式是否符合预期
