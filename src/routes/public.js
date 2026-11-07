import { getServerStatus } from '../ts3/status.js';

export default async function publicRoutes(app) {
  app.get('/', async (request, reply) => {
    return reply.render('./index', {
      title: 'Startseite',
      visitorIp: request.ip,
    });
  });

  app.get('/api/status', async () => getServerStatus());

  app.get('/health', async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
  }));
}