import express from 'express';
import { createServer } from 'http';
import cors, { type CorsOptions } from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { initSocket } from './config/socket.js';
import { initGameServer } from './game/gameServer.js';
import { buildCorsOriginOption } from './bootstrap/cors.js';
import { registerRoutes } from './bootstrap/registerRoutes.js';
import { registerGracefulShutdown, startServerWithPipeline } from './bootstrap/startupPipeline.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);

const HOST = String(process.env.HOST ?? '0.0.0.0').trim() || '0.0.0.0';
const PORT = Number(process.env.PORT || 6011);
const corsOriginOption = buildCorsOriginOption(process.env.CORS_ORIGIN);
const corsOrigin = corsOriginOption as CorsOptions['origin'];

// 中间件
app.use(cors({ origin: corsOrigin, credentials: true }));
app.use(express.json());

// 静态文件服务（头像）
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 初始化Socket.io（聊天等）
initSocket(httpServer, corsOriginOption);

// 初始化游戏服务器（boardgame.io）
initGameServer(httpServer, corsOriginOption);

registerRoutes(app);
registerGracefulShutdown(httpServer);

void startServerWithPipeline({
  httpServer,
  host: HOST,
  port: PORT,
}).catch((error) => {
  console.error('服务启动失败:', error);
  process.exit(1);
});
