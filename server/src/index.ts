import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { applySchema, DB_PATH } from './db/connection.js';
import { attachUser } from './middleware/auth.js';
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

const PORT = Number(process.env.PORT ?? 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';

applySchema();

const app = express();
app.disable('x-powered-by');
app.use(
  cors({
    origin: [CLIENT_ORIGIN, 'http://127.0.0.1:5173'],
    credentials: true,
  }),
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

// Serve the built frontend when it exists (production mode).
const webDist = join(process.cwd(), '..', 'web', 'dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(join(webDist, 'index.html')));
}

app.use('/api', notFoundHandler);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Research & Innovation Hub API`);
  console.log(`  ------------------------------------------------------------`);
  console.log(`  API      : http://localhost:${PORT}/api`);
  console.log(`  Database : ${DB_PATH}`);
  console.log(`  Health   : http://localhost:${PORT}/api/health\n`);
});
