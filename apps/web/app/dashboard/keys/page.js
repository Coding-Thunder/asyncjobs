'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, API_URL } from '../../../lib/api';

export default function KeysPage() {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState('');
  const [deleting, setDeleting] = useState(null);

  const loadKeys = useCallback(async () => {
    try {
      const data = await apiFetch('/api-keys');
      setKeys(data.keys || []);
      setErr('');
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  async function createKey(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setErr('');
    try {
      const data = await apiFetch('/api-keys', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim() }),
      });
      setNewKey(data);
      setName('');
      await loadKeys();
    } catch (e) {
      setErr(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function deleteKey(id) {
    setDeleting(id);
    try {
      await apiFetch(`/api-keys/${id}`, { method: 'DELETE' });
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch (e) {
      setErr(e.message);
    } finally {
      setDeleting(null);
    }
  }

  function copy(label, text) {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 1500);
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="font-mono text-lg text-zinc-100">
          <span className="text-emerald-400">$</span> api-keys <span className="text-zinc-500">--list</span>
        </h1>
        <p className="font-mono text-xs text-zinc-500 mt-1">
          create keys for programmatic access. use in <span className="text-sky-400">Authorization</span> header or via SDK.
        </p>
      </div>

      {err && (
        <div className="font-mono text-sm text-rose-400 border border-rose-500/20 bg-rose-500/5 rounded-md p-3">
          <span className="text-rose-500 font-semibold">[ERROR]</span> {err}
        </div>
      )}

      {/* Newly created key banner */}
      {newKey && (
        <div className="term-panel border-emerald-500/20 p-5 space-y-3">
          <div className="flex items-start justify-between">
            <div>
              <div className="font-mono text-sm text-emerald-300">
                <span className="font-semibold">[OK]</span> key created: {newKey.name}
              </div>
              <div className="font-mono text-[11px] text-zinc-500 mt-0.5">
                copy it now — it will not be shown again.
              </div>
            </div>
            <button
              onClick={() => setNewKey(null)}
              className="text-zinc-500 hover:text-zinc-200 font-mono text-lg leading-none"
            >
              ×
            </button>
          </div>
          <div className="flex gap-2">
            <code className="flex-1 px-3 py-2 bg-[#080808] border border-white/[0.08] rounded-md font-mono text-xs text-emerald-300 break-all select-all">
              {newKey.key}
            </code>
            <button
              onClick={() => copy('newkey', newKey.key)}
              className="term-btn text-xs shrink-0"
            >
              {copied === 'newkey' ? 'copied!' : 'copy'}
            </button>
          </div>
          <div className="font-mono text-[11px] text-amber-400 border border-amber-500/20 bg-amber-500/5 rounded-md p-2.5">
            [WARN] this key will only be shown once. store it securely.
          </div>
        </div>
      )}

      {/* Create key form */}
      <div className="term-panel overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] bg-[#161616]">
          <span className="font-mono text-xs text-zinc-500">
            <span className="text-emerald-400">$</span> api-keys --create
          </span>
        </div>
        <form onSubmit={createKey} className="p-5 flex gap-3 items-end">
          <div className="flex-1">
            <label className="font-mono text-xs text-zinc-500 mb-1 block">name:</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. production-backend"
              className="term-input w-full"
            />
          </div>
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="term-btn text-xs"
          >
            {creating ? 'creating…' : '$ create'}
          </button>
        </form>
      </div>

      {/* Key list */}
      <div className="term-panel overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] bg-[#161616] flex items-center justify-between">
          <span className="font-mono text-xs text-zinc-500">
            <span className="text-emerald-400">$</span> keys --active
          </span>
          <span className="font-mono text-[11px] text-zinc-600">
            {keys.length} key{keys.length !== 1 ? 's' : ''}
          </span>
        </div>
        {loading ? (
          <div className="p-5 font-mono text-xs text-zinc-600">loading…<span className="term-cursor" /></div>
        ) : keys.length === 0 ? (
          <div className="p-5 font-mono text-xs text-zinc-600">no api keys found. create one above.</div>
        ) : (
          <div className="divide-y divide-white/[0.04]">
            {keys.map((k) => (
              <div key={k.id} className="px-5 py-4 flex items-center gap-4 hover:bg-white/[0.02] transition-colors">
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-sm text-zinc-200">{k.name}</div>
                  <div className="font-mono text-xs text-zinc-600 mt-0.5">
                    {k.prefix}{'••••••••••••••••'}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono text-[11px] text-zinc-600">
                    created {new Date(k.createdAt).toLocaleDateString()}
                  </div>
                  <div className="font-mono text-[11px] text-zinc-700">
                    {k.lastUsedAt
                      ? `last used ${new Date(k.lastUsedAt).toLocaleDateString()}`
                      : 'never used'}
                  </div>
                </div>
                <button
                  onClick={() => deleteKey(k.id)}
                  disabled={deleting === k.id}
                  className="term-btn-danger text-xs"
                >
                  {deleting === k.id ? 'deleting…' : '$ rm'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage snippet */}
      <div className="term-panel overflow-hidden">
        <div className="px-5 py-3 border-b border-white/[0.06] bg-[#161616]">
          <span className="font-mono text-xs text-zinc-500">
            <span className="text-emerald-400">$</span> cat examples.md
          </span>
        </div>
        <div className="p-5 space-y-4">
          <CodeBlock
            title="sdk"
            code={`const { init, client } = require('asyncops-sdk');

init({
  baseUrl: '${API_URL}',
  apiKey: 'ak_live_your_key_here',
});

const { id } = await client.createJob({
  type: 'send-email',
  data: { to: 'user@example.com' },
});`}
            onCopy={() => copy('sdk', 'copied')}
            copied={copied === 'sdk'}
          />
          <CodeBlock
            title="curl"
            code={`curl -X POST ${API_URL}/jobs \\
  -H "Authorization: Bearer ak_live_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"type":"send-email","data":{"to":"user@example.com"}}'`}
            onCopy={() => copy('curl', 'copied')}
            copied={copied === 'curl'}
          />
        </div>
      </div>
    </div>
  );
}

function CodeBlock({ title, code, onCopy, copied }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="font-mono text-[11px] text-zinc-600"># {title}</div>
        <button
          onClick={onCopy}
          className="font-mono text-[11px] text-zinc-600 hover:text-emerald-400 px-2 py-0.5 rounded border border-white/[0.08] hover:border-emerald-500/30 transition-all"
        >
          {copied ? 'copied!' : 'copy'}
        </button>
      </div>
      <pre className="font-mono text-xs bg-[#080808] border border-white/[0.06] text-zinc-300 rounded-lg p-4 overflow-auto whitespace-pre-wrap">
        {code}
      </pre>
    </div>
  );
}
