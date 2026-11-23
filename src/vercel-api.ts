import express from 'express';
import { registerAiRoutes } from './ai-routes';

const app = express();

app.use(express.json({ limit: '30mb' }));

app.use((req, _res, next) => {
  const header = req.headers['x-forwarded-uri'] ?? req.headers['x-invoke-path'];
  const original = Array.isArray(header) ? header[0] : header;
  if (original?.startsWith('/api/') && req.url && !req.url.startsWith('/api/')) {
    const path = original.split('?')[0];
    req.url = original.includes('?') ? `${path}?${original.split('?')[1]}` : path;
  }
  next();
});

registerAiRoutes(app);

export default app;
