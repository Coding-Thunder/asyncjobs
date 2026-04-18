// In-process rate limiting. AsyncOps runs single-replica (see SYSTEM.md
// §7.2), so an in-memory store is correct — no Redis round-trip, no shared
// state concerns. If we ever scale horizontally, swap the store for the
// `rate-limit-redis` adapter and key off the existing ioredis connection.
//
// Disabled in NODE_ENV=test so Jest suites can hammer endpoints without
// hitting caps. Everything else (prod and dev) gets limits applied.

const rateLimit = require('express-rate-limit');

const DISABLED = process.env.NODE_ENV === 'test';

function noop(_req, _res, next) {
  next();
}

// Per-IP limit for the auth surface (signup, login, verify). Tight enough to
// deter credential-stuffing from a single source without blocking a real
// user who fat-fingers the password a few times.
const authLimiter = DISABLED
  ? noop
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 20,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'too many auth requests, slow down' },
    });

// Job-creation limit. Keys on authenticated user id when present (covers
// both JWT and API-key paths — each key maps to a user), else IP. Higher
// ceiling than auth because legitimate batch submitters burst; still bounded.
function jobCreateKey(req) {
  if (req.user && req.user.id) return `uid:${req.user.id.toString()}`;
  return `ip:${req.ip}`;
}

const jobCreateLimiter = DISABLED
  ? noop
  : rateLimit({
      windowMs: 60 * 1000,
      limit: 120,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      keyGenerator: jobCreateKey,
      message: { error: 'too many job submissions, slow down' },
    });

module.exports = { authLimiter, jobCreateLimiter };
