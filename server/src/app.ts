import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { attachUser } from './middleware/auth.js';
import { DB_PATH } from './db/connection.js';
import { errorHandler, notFoundHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { dashboardRouter } from './routes/dashboard.js';
import { projectsRouter } from './routes/projects.js';
import { iprRouter } from './routes/ipr.js';
import { approvalsRouter } from './routes/approvals.js';
import { startupsRouter } from './routes/startups.js';
import { mentorsRouter } from './routes/mentors.js';
import { fundingRouter } from './routes/funding.js';
import { documentsRouter } from './routes/documents.js';
import { analyticsRouter } from './routes/analytics.js';
import { notificationsRouter } from './routes/notifications.js';
import { usersRouter } from './routes/users.js';
import { departmentsRouter, settingsRouter } from './routes/settings.js';
import { searchRouter } from './routes/search.js';

const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
const IS_SERVERLESS = process.env.VERCEL === '1';

/**
 * Builds the Express application without binding a port.
 *
 * Keeping this free of `listen()` lets the same app run behind a long-lived
 * Node process (`index.ts`) and inside a serverless function (`lambda.ts`).
 */
export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    cors(
      IS_SERVERLESS
        ? // On Vercel the frontend and API share an origin; reflecting the
          // request origin keeps CORS correct if the site is ever proxied.
          { origin: true, credentials: true }
        : { origin: [CLIENT_ORIGIN, 'http://127.0.0.1:5173'], credentials: true },
    ),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', database: DB_PATH, time: new Date().toISOString() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/dashboard', dashboardRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/ipr', iprRouter);
  app.use('/api/approvals', approvalsRouter);
  app.use('/api/startups', startupsRouter);
  app.use('/api/mentors', mentorsRouter);
  app.use('/api/funding', fundingRouter);
  app.use('/api/documents', documentsRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/notifications', notificationsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/departments', departmentsRouter);
  app.use('/api/settings', settingsRouter);
  app.use('/api/search', searchRouter);

  // Serve the built frontend when it exists (single-service production mode).
  // On Vercel the static site is served by the platform, so this is skipped.
  const webDist = join(process.cwd(), '..', 'dist');
  if (!IS_SERVERLESS && existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
  }

  app.use('/api', notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
