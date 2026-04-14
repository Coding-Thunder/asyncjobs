// AsyncOps SDK — JobsClient + createWorker
//
// AsyncOps is a debugging and control layer for async workflows. Users run
// their own workers (with their own handlers), and talk to AsyncOps over HTTPS
// using an API key. Redis / BullMQ are internal to AsyncOps and are never
// exposed.
//
// Usage:
//
//   const asyncops = require('asyncops-sdk');
//   asyncops.init({ apiKey: process.env.ASYNCOPS_API_KEY });
//
//   // 1) create a job from your app
//   await asyncops.client.createJob({ type: 'send-email', data: { to: 'a@b.co' } });
//
//   // 2) run a worker in a separate process
//   asyncops.createWorker({
//     handlers: {
//       'send-email': async (job, ctx) => {
//         await ctx.log(`sending to ${job.data.to}`);
//         await sendMail(job.data);
//         return { sent: true };
//       },
//     },
//   }).start();

const DEFAULT_BASE_URL =
  (typeof process !== 'undefined' && process.env && process.env.ASYNCOPS_URL) ||
  'https://api.asyncops.com';

// --------------------------------------------------------------------------
// Global config — populated by asyncops.init(). JobsClient and createWorker
// fall back to these values when apiKey / baseUrl are not passed explicitly,
// so developers only need to configure credentials once per process.
// --------------------------------------------------------------------------
const globalConfig = { apiKey: null, baseUrl: null };

function init({ apiKey, baseUrl } = {}) {
  if (apiKey !== undefined) globalConfig.apiKey = apiKey || null;
  if (baseUrl !== undefined) globalConfig.baseUrl = baseUrl || null;
  return { apiKey: globalConfig.apiKey, baseUrl: globalConfig.baseUrl };
}

function getConfig() {
  return { apiKey: globalConfig.apiKey, baseUrl: globalConfig.baseUrl };
}

function resetConfig() {
  globalConfig.apiKey = null;
  globalConfig.baseUrl = null;
}

const MISSING_KEY_MSG =
  'AsyncOps: API key missing. Call asyncops.init({ apiKey }) once at startup, ' +
  'or pass { apiKey } explicitly to new JobsClient() / createWorker().';

class JobsClient {
  constructor({ baseUrl, apiKey, token } = {}) {
    // Store explicit values; resolve lazily against globalConfig at call time
    // so a client constructed before init() still picks up the key.
    this._explicitBaseUrl = baseUrl || null;
    this._explicitApiKey = apiKey || token || null;
  }

  get baseUrl() {
    const raw = this._explicitBaseUrl || globalConfig.baseUrl || DEFAULT_BASE_URL;
    return raw.replace(/\/$/, '');
  }

  get token() {
    return this._explicitApiKey || globalConfig.apiKey || null;
  }

  set token(value) {
    this._explicitApiKey = value || null;
  }

  setToken(token) {
    this._explicitApiKey = token || null;
  }

  _assertAuth() {
    if (!this.token) throw new Error(MISSING_KEY_MSG);
  }

  async _request(path, options = {}) {
    const { auth = true, ...rest } = options;
    if (auth) this._assertAuth();
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
        ...(rest.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {}
      const msg = (parsed && parsed.error) || text || `HTTP ${res.status}`;
      const err = new Error(`AsyncOps ${options.method || 'GET'} ${path}: ${msg}`);
      err.status = res.status;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  }

  // ---- Auth ----
  signup({ email, password }) {
    return this._request('/auth/signup', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    });
  }

  async login({ email, password }) {
    const data = await this._request('/auth/login', {
      method: 'POST',
      auth: false,
      body: JSON.stringify({ email, password }),
    });
    if (data && data.token) this._explicitApiKey = data.token;
    return data;
  }

  // ---- API keys ----
  createApiKey({ name }) {
    return this._request('/api-keys', {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }
  listApiKeys() {
    return this._request('/api-keys');
  }
  deleteApiKey(id) {
    return this._request(`/api-keys/${id}`, { method: 'DELETE' });
  }

  // ---- Jobs ----
  createJob({ type, data = null, idempotencyKey } = {}) {
    if (!type) throw new Error('createJob: type is required');
    const headers = {};
    if (idempotencyKey) headers['Idempotency-Key'] = String(idempotencyKey);
    return this._request('/jobs', {
      method: 'POST',
      headers,
      body: JSON.stringify({ type, data }),
    });
  }

  listJobs() {
    return this._request('/jobs');
  }

  getJob(jobId) {
    return this._request(`/jobs/${encodeURIComponent(jobId)}`);
  }

  retryJob(jobId) {
    return this._request(`/jobs/${encodeURIComponent(jobId)}/retry`, {
      method: 'POST',
    });
  }

  // ---- Worker-facing helpers ----
  nextJob({ types } = {}) {
    if (!Array.isArray(types) || types.length === 0) {
      throw new Error('nextJob: types (non-empty array) is required');
    }
    const q = encodeURIComponent(types.join(','));
    return this._request(`/jobs/next?types=${q}`);
  }

  completeJob(jobId, result) {
    return this._request(`/jobs/${encodeURIComponent(jobId)}/complete`, {
      method: 'POST',
      body: JSON.stringify({ result: result === undefined ? null : result }),
    });
  }

  failJob(jobId, error) {
    const message =
      error instanceof Error ? error.message : String(error ?? 'unknown error');
    return this._request(`/jobs/${encodeURIComponent(jobId)}/fail`, {
      method: 'POST',
      body: JSON.stringify({ error: message }),
    });
  }

  logJob(jobId, message) {
    return this._request(`/jobs/${encodeURIComponent(jobId)}/logs`, {
      method: 'POST',
      body: JSON.stringify({ message: String(message) }),
    });
  }

  // ---- Realtime subscription (browser + Node) ----
  subscribe(jobId, callback) {
    let unsubscribed = false;
    let es = null;
    let pollTimer = null;
    let lastStatus = null;
    let lastLogCount = 0;

    const startPolling = () => {
      const tick = async () => {
        if (unsubscribed) return;
        try {
          const { job, logs } = await this.getJob(jobId);
          if (job && job.status !== lastStatus) {
            lastStatus = job.status;
            callback({ type: 'status', data: job });
          }
          if (Array.isArray(logs) && logs.length > lastLogCount) {
            for (let i = lastLogCount; i < logs.length; i++) {
              callback({ type: 'log', data: logs[i] });
            }
            lastLogCount = logs.length;
          }
        } catch (_) {}
        if (!unsubscribed) pollTimer = setTimeout(tick, 2000);
      };
      tick();
    };

    const ES =
      (typeof globalThis !== 'undefined' && globalThis.EventSource) ||
      (typeof EventSource !== 'undefined' ? EventSource : undefined);

    if (ES && typeof window !== 'undefined') {
      const url = `${this.baseUrl}/jobs/${encodeURIComponent(
        jobId
      )}/stream?token=${encodeURIComponent(this.token || '')}`;
      try {
        es = new ES(url);
        let opened = false;
        es.onopen = () => {
          opened = true;
        };
        es.onmessage = (ev) => {
          try {
            callback(JSON.parse(ev.data));
          } catch {}
        };
        es.onerror = () => {
          if (!opened && !unsubscribed) {
            try { es.close(); } catch {}
            es = null;
            startPolling();
          }
        };
      } catch {
        es = null;
        startPolling();
      }
    } else {
      startPolling();
    }

    return function unsubscribe() {
      unsubscribed = true;
      if (es) { try { es.close(); } catch {} es = null; }
      if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    };
  }
}

// --------------------------------------------------------------------------
// createWorker — long-running process that polls AsyncOps for jobs whose type
// matches a registered handler, runs the handler in-process, and reports back.
// --------------------------------------------------------------------------
function createWorker({
  baseUrl,
  apiKey,
  handlers,
  pollInterval = 1000,
  idlePollInterval = 2000,
  handlerTimeoutMs = 5 * 60 * 1000,
  onError,
  logger = console,
} = {}) {
  const resolvedApiKey = apiKey || globalConfig.apiKey;
  if (!resolvedApiKey) throw new Error(MISSING_KEY_MSG);
  if (!handlers || typeof handlers !== 'object' || Object.keys(handlers).length === 0) {
    throw new Error('createWorker: at least one handler is required');
  }

  const client = new JobsClient({ baseUrl, apiKey: resolvedApiKey });
  const types = Object.keys(handlers);

  let running = false;
  let loopPromise = null;
  let idleTimer = null;
  let idleResolve = null;

  const safeOnError = (err, ctx) => {
    try {
      if (typeof onError === 'function') onError(err, ctx);
      else if (logger && logger.error) logger.error('[asyncops-worker]', err.message || err);
    } catch {}
  };

  const withTimeout = (promise, ms, label) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${label} timed out after ${ms}ms`));
      }, ms);
      Promise.resolve(promise).then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); }
      );
    });

  async function runOnce() {
    let job;
    try {
      const res = await client.nextJob({ types });
      job = res && res.job;
    } catch (err) {
      safeOnError(err, { stage: 'fetch' });
      return { picked: false };
    }
    if (!job) return { picked: false };

    const handler = handlers[job.type];
    if (!handler) {
      const msg = `no handler registered for type "${job.type}"`;
      safeOnError(new Error(msg), { stage: 'dispatch', jobId: job.id });
      try { await client.failJob(job.id, msg); }
      catch (err) { safeOnError(err, { stage: 'fail', jobId: job.id }); }
      return { picked: true };
    }

    const ctx = {
      log: (message) =>
        client.logJob(job.id, message).catch((e) =>
          safeOnError(e, { stage: 'log', jobId: job.id })
        ),
    };

    logger && logger.log && logger.log(`[asyncops-worker] running ${job.type} (${job.id})`);

    try {
      const result = await withTimeout(
        Promise.resolve().then(() => handler(job, ctx)),
        handlerTimeoutMs,
        `handler "${job.type}"`
      );
      await client.completeJob(job.id, result === undefined ? null : result);
      logger && logger.log && logger.log(`[asyncops-worker] completed ${job.id}`);
    } catch (err) {
      safeOnError(err, { stage: 'handler', jobId: job.id, type: job.type });
      try { await client.failJob(job.id, err); }
      catch (reportErr) { safeOnError(reportErr, { stage: 'fail', jobId: job.id }); }
    }
    return { picked: true };
  }

  async function loop() {
    while (running) {
      let picked = false;
      try {
        const r = await runOnce();
        picked = !!(r && r.picked);
      } catch (err) {
        safeOnError(err, { stage: 'loop' });
      }
      if (!running) break;
      const wait = picked ? pollInterval : idlePollInterval;
      await new Promise((resolve) => {
        idleResolve = resolve;
        idleTimer = setTimeout(() => {
          idleTimer = null;
          idleResolve = null;
          resolve();
        }, wait);
      });
    }
  }

  function start() {
    if (running) return;
    running = true;
    logger && logger.log && logger.log(`[asyncops-worker] started; types=${types.join(',')}`);
    loopPromise = loop();
    return loopPromise;
  }

  async function stop() {
    if (!running) return;
    running = false;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    if (idleResolve) { const r = idleResolve; idleResolve = null; r(); }
    if (loopPromise) { try { await loopPromise; } catch {} loopPromise = null; }
    logger && logger.log && logger.log('[asyncops-worker] stopped');
  }

  return { start, stop, runOnce, types, client };
}

// Shared default JobsClient. Resolves apiKey / baseUrl lazily against
// globalConfig, so `const { client } = require('asyncops-sdk')` works as long
// as asyncops.init({ apiKey }) runs before the first call.
const client = new JobsClient();

module.exports = {
  init,
  getConfig,
  resetConfig,
  client,
  JobsClient,
  createWorker,
};
