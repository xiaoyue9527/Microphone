import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import logger from '../logger';

// 用户角色类型
export type UserRole = 'product_manager' | 'developer';

// 房间状态接口
export interface Room {
    id: string;
    name: string;
    users: Map<string, User>;
    createdAt: number;
}

// 用户接口
export interface User {
    id: string;
    socket: WebSocket;
    role: UserRole;
    name: string;
    roomId: string;
    joinedAt: number;
}

// 消息类型
export interface ChatMessage {
    id: string;
    type: 'chat_message' | 'system_message' | 'user_joined' | 'user_left';
    userId?: string;
    userName: string;
    userRole: UserRole;
    content: string;
    timestamp: number;
}

// WebSocket消息类型
export interface WSMessage {
    type: 'join_room' | 'chat_message' | 'leave_room' | 'list_users';
    payload: any;
}

export class WSServer {
    private wss: WebSocketServer;
    private rooms: Map<string, Room> = new Map();
    private users: Map<string, User> = new Map();

    constructor(port: number) {
        this.wss = new WebSocketServer({ port });
        this.setupEventHandlers();

        logger.info(`WebSocket服务器启动在端口 ${port}`);
    }

    private setupEventHandlers() {
        this.wss.on('connection', (ws: WebSocket) => {
            const userId = uuidv4();
            logger.info(`用户连接: ${userId}`);

            ws.on('message', (data: Buffer) => {
                try {
                    const message: WSMessage = JSON.parse(data.toString());
                    this.handleMessage(userId, ws, message);
                } catch (error) {
                    this.sendError(ws, '消息格式错误');
                }
            });

            ws.on('close', () => {
                this.handleDisconnect(userId);
            });

            ws.on('error', (error: any) => {
                logger.error(`WebSocket错误 (用户 ${userId}):`, error);
                this.handleDisconnect(userId);
            });

            // 发送连接成功消息
            this.sendToUser(ws, {
                type: 'connection_established',
                payload: { userId }
            });
        });
    }

    private async handleMessage(userId: string, ws: WebSocket, message: WSMessage) {
        try {
            switch (message.type) {
                case 'join_room':
                    await this.handleJoinRoom(userId, ws, message.payload);
                    break;
                case 'chat_message':
                    await this.handleChatMessage(userId, message.payload);
                    break;
                case 'leave_room':
                    this.handleLeaveRoom(userId);
                    break;
                case 'list_users':
                    this.handleListUsers(userId);
                    break;
                default:
                    this.sendError(ws, '未知的消息类型');
            }
        } catch (error: any) {
            logger.error('处理消息错误:', error);
            this.sendError(ws, error instanceof Error ? error.message : '服务器错误');
        }
    }

    private async handleJoinRoom(userId: string, ws: WebSocket, payload: any) {
        const { roomName, userName, userRole } = payload;

        if (!roomName || !userName || !userRole) {
            this.sendError(ws, '缺少必要参数: roomName, userName, userRole');
            return;
        }

        // 验证用户角色
        if (userRole !== 'product_manager' && userRole !== 'developer') {
            this.sendError(ws, '无效的用户角色');
            return;
        }

        // 离开之前的房间（如果存在）
        this.handleLeaveRoom(userId);

        // 查找或创建房间
        let room: Room;
        const existingRoom = Array.from(this.rooms.values()).find(r => r.name === roomName);

        if (existingRoom) {
            room = existingRoom;
        } else {
            // 创建新房间
            room = {
                id: uuidv4(),
                name: roomName,
                users: new Map(),
                createdAt: Date.now()
            };
            this.rooms.set(room.id, room);
            logger.info(`创建新房间: ${roomName} (${room.id})`);
        }

        // 创建用户
        const user: User = {
            id: userId,
            socket: ws,
            role: userRole as UserRole,
            name: userName,
            roomId: room.id,
            joinedAt: Date.now()
        };

        // 添加到房间和用户列表
        room.users.set(userId, user);
        this.users.set(userId, user);

        // 发送加入成功消息
        this.sendToUser(ws, {
            type: 'room_joined',
            payload: {
                roomId: room.id,
                roomName: room.name,
                userCount: room.users.size
            }
        });

        // 广播用户加入消息
        this.broadcastToRoom(room.id, {
            type: 'user_joined',
            payload: {
                user: {
                    id: user.id,
                    name: user.name,
                    role: user.role
                },
                users: this.getRoomUsers(room.id),
                message: {
                    id: uuidv4(),
                    type: 'system_message',
                    userName: '系统',
                    content: `${userName} 加入了房间`,
                    timestamp: Date.now()
                }
            }
        }, userId);

        // 发送当前用户列表给新用户
        this.sendUserList(userId);

        logger.info(`用户加入房间: ${userName} (${userRole}) -> ${room.name}`);
    }

    private async handleChatMessage(userId: string, payload: any) {
        const user = this.users.get(userId);
        if (!user) {
            throw new Error('用户未加入任何房间');
        }

        const room = this.rooms.get(user.roomId);
        if (!room) {
            throw new Error('房间不存在');
        }

        // 创建聊天消息
        const chatMessage: ChatMessage = {
            id: uuidv4(),
            type: 'chat_message',
            userId: user.id,
            userName: user.name,
            userRole: user.role,
            content: payload.content,
            timestamp: Date.now()
        };

        // 广播给房间内除发送者外的所有用户
        this.broadcastToRoom(room.id, {
            type: 'chat_message',
            payload: chatMessage
        }, userId); // 排除发送者

        logger.info(`用户发送消息: ${user.name} -> ${room.name}`);
    }

    private handleLeaveRoom(userId: string) {
        const user = this.users.get(userId);
        if (!user) return;

        const room = this.rooms.get(user.roomId);
        if (room) {
            const userName = user.name;

            // 从房间移除用户
            room.users.delete(userId);
            this.users.delete(userId);

            // 广播用户离开消息
            this.broadcastToRoom(room.id, {
                type: 'user_left',
                payload: {
                    user: {
                        id: user.id,
                        name: user.name,
                        role: user.role
                    },
                    users: this.getRoomUsers(room.id),
                    message: {
                        id: uuidv4(),
                        type: 'system_message',
                        userName: '系统',
                        content: `${userName} 离开了房间`,
                        timestamp: Date.now()
                    }
                }
            });

            // 如果房间为空，删除房间
            if (room.users.size === 0) {
                this.rooms.delete(room.id);
                logger.info(`房间关闭: ${room.name}`);
            }

            logger.info(`用户离开房间: ${userName} -> ${room.name}`);
        }
    }

    private handleListUsers(userId: string) {
        const user = this.users.get(userId);
        if (!user) return;

        this.sendUserList(userId);
    }

    private sendUserList(userId: string) {
        const user = this.users.get(userId);
        if (!user) return;

        const room = this.rooms.get(user.roomId);
        if (!room) return;

        this.sendToUser(user.socket, {
            type: 'user_list',
            payload: {
                users: this.getRoomUsers(room.id)
            }
        });
    }

    private getRoomUsers(roomId: string): Array<{ id: string, name: string, role: UserRole }> {
        const room = this.rooms.get(roomId);
        if (!room) return [];

        return Array.from(room.users.values()).map(user => ({
            id: user.id,
            name: user.name,
            role: user.role
        }));
    }

    private handleDisconnect(userId: string) {
        logger.info(`用户断开连接: ${userId}`);
        this.handleLeaveRoom(userId);
    }

    private broadcastToRoom(roomId: string, message: any, excludeUserId?: string) {
        const room = this.rooms.get(roomId);
        if (!room) return;

        room.users.forEach((user, userId) => {
            if (userId !== excludeUserId && user.socket.readyState === WebSocket.OPEN) {
                this.sendToUser(user.socket, message);
            }
        });
    }

    private sendToUser(ws: WebSocket, message: any) {
        if (ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify(message));
            } catch (error: any) {
                logger.error('发送消息失败:', error);
            }
        }
    }

    private sendError(ws: WebSocket, error: string) {
        this.sendToUser(ws, {
            type: 'error',
            payload: { error }
        });
    }

    // 获取统计信息
    getStats() {
        const roomsInfo = Array.from(this.rooms.values()).map(room => ({
            id: room.id,
            name: room.name,
            userCount: room.users.size,
            createdAt: room.createdAt
        }));

        return {
            totalRooms: this.rooms.size,
            totalUsers: this.users.size,
            rooms: roomsInfo
        };
    }

    // 关闭服务器
    close() {
        this.wss.close(() => {
            logger.info('WebSocket服务器已关闭');
        });
    }
}