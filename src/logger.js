import pino from 'pino';
import { config } from './config.js';

// Gemeinsamer Logger für Fastify und den Rest der App
export const logger = pino({
  level: config.logLevel,
  transport: {
    target: 'pino-pretty',
    options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
  },
});