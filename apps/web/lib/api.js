export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export function getToken() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

export function getUser() {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem('user');
  return raw ? JSON.parse(raw) : null;
}

export function saveAuth(token, user) {
  window.localStorage.setItem('token', token);
  window.localStorage.setItem('user', JSON.stringify(user));
}

export function isAdmin() {
  const user = getUser();
  return user?.role === 'admin';
}

export function clearAuth() {
  window.localStorage.removeItem('token');
  window.localStorage.removeItem('user');
}

export async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};

  if (!res.ok) {
    const err = new Error(data.error || `request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

export function subscribeJob(jobId, callback) {
  const token = getToken();
  let unsubscribed = false;
  let es = null;
  let pollTimer = null;
  let lastStatus = null;
  let lastLogCount = 0;

  const startPolling = () => {
    const tick = async () => {
      if (unsubscribed) return;
      try {
        const { job, logs } = await apiFetch(`/jobs/${jobId}`);
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
      } catch (_) {
        // transient; keep polling
      }
      if (!unsubscribed) pollTimer = setTimeout(tick, 2000);
    };
    tick();
  };

  if (typeof window !== 'undefined' && typeof window.EventSource !== 'undefined') {
    try {
      const url = `${API_URL}/jobs/${encodeURIComponent(jobId)}/stream?token=${encodeURIComponent(token || '')}`;
      es = new window.EventSource(url);
      let opened = false;
      es.onopen = () => {
        opened = true;
      };
      es.onmessage = (ev) => {
        try {
          callback(JSON.parse(ev.data));
        } catch (_) {
          // ignore malformed frames
        }
      };
      es.onerror = () => {
        if (!opened && !unsubscribed) {
          try {
            es.close();
          } catch (_) {}
          es = null;
          startPolling();
        }
      };
    } catch (_) {
      es = null;
      startPolling();
    }
  } else {
    startPolling();
  }

  return function unsubscribe() {
    unsubscribed = true;
    if (es) {
      try {
        es.close();
      } catch (_) {}
      es = null;
    }
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  };
}
