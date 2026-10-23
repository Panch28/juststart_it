'use strict';

/**
 * Vercel catch-all function: every `/api/*` request is handled by the bundled
 * Express app, so the API keeps its normal routes, middleware and permissions.
 *
 * The bundle is produced by `npm run build:api` (see scripts/build-api.mjs).
 */
const bundle = require('./_bundle.cjs');
const app = bundle.default || bundle;

module.exports = async function handler(req, res) {
  // Vercel normally passes the original URL through, but rebuild it from the
  // catch-all segments if it ever arrives rewritten, so Express sees `/api/...`.
  if (!req.url || !req.url.startsWith('/api')) {
    const raw = req.query && req.query.path;
    const segments = Array.isArray(raw) ? raw : raw ? [raw] : [];
    const queryIndex = (req.url || '').indexOf('?');
    const query = queryIndex >= 0 ? req.url.slice(queryIndex) : '';
    req.url = `/api${segments.length ? `/${segments.join('/')}` : ''}${query}`;
  }

  await app(req, res);
};
