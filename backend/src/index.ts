import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import pinoHttp from 'pino-http';
import { config } from './config';
import { logger } from './lib/logger';
import { errorHandler } from './middleware/error.middleware';
import { globalRateLimiter, replayProtection } from './middleware/rate-limit.middleware';

import authRoutes from './routes/auth.routes';
import playerRoutes from './routes/player.routes';
import economyRoutes from './routes/economy.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import socialRoutes from './routes/social.routes';
import matchmakingRoutes from './routes/matchmaking.routes';
import photonRoutes from './routes/photon.routes';
import achievementsRoutes from './routes/achievements.routes';
import cloudFunctionsRoutes from './routes/cloud-functions.routes';
import analyticsRoutes from './routes/analytics.routes';
import adminRoutes from './routes/admin.routes';
import serverRoutes from './routes/server.routes';

const app = express();

app.set('trust proxy', config.trustProxyHops);
app.use(helmet());
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser(config.session.secret) as unknown as express.RequestHandler);
app.use(pinoHttp({ logger }));
app.use(globalRateLimiter);
app.use(replayProtection());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'rayvo-backend', version: '1.0.0' });
});

app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'Rayvo Game Backend API',
    version: '1.0.0',
    documentation: '/api/v1/docs',
  });
});

const v1 = express.Router();
v1.use('/auth', authRoutes);
v1.use('/player', playerRoutes);
v1.use('/economy', economyRoutes);
v1.use('/leaderboards', leaderboardRoutes);
v1.use('/social', socialRoutes);
v1.use('/matchmaking', matchmakingRoutes);
v1.use('/photon', photonRoutes);
v1.use('/achievements', achievementsRoutes);
v1.use('/functions', cloudFunctionsRoutes);
v1.use('/analytics', analyticsRoutes);
v1.use('/admin', adminRoutes);
v1.use('/server', serverRoutes);

app.use('/api/v1', v1);
app.use(errorHandler);

const server = app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env }, 'Rayvo backend started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  server.close(() => process.exit(0));
});

export default app;
