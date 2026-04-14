// In-process event bus for SSE fan-out.
// Worker HTTP endpoints and SSE streams live in the same API process,
// so we don't need Redis pub/sub. If you later scale the API horizontally,
// swap this for a shared pub/sub.

const listeners = new Map(); // jobId -> Set<res>

function addListener(jobId, res) {
  let set = listeners.get(jobId);
  if (!set) {
    set = new Set();
    listeners.set(jobId, set);
  }
  set.add(res);
}

function removeListener(jobId, res) {
  const set = listeners.get(jobId);
  if (!set) return;
  set.delete(res);
  if (set.size === 0) listeners.delete(jobId);
}

function publishEvent(jobId, event) {
  const set = listeners.get(jobId);
  if (!set || set.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of set) {
    try {
      res.write(payload);
    } catch (_) {
      // stream torn down; ignore
    }
  }
}

module.exports = { addListener, removeListener, publishEvent };
