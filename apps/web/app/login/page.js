'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch, saveAuth } from '../../lib/api';
import { sanitizeNextPath } from '../../lib/nextPath';
import {
  TerminalAuthLayout,
  TerminalField,
  TerminalSubmitButton,
  TerminalError,
  TerminalSuccess,
  useTerminalForm,
} from '../../components/TerminalAuthLayout';

const BOOT_LINES = [
  'asyncops cli v1.0.0',
  'initializing secure session...',
  'type credentials to continue.',
];

export default function LoginPage() {
  return (
    <Suspense fallback={<TerminalAuthLayout bootLines={BOOT_LINES} />}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next')) || '/dashboard/jobs',
    [searchParams]
  );
  const signupHref = useMemo(() => {
    const sanitized = sanitizeNextPath(searchParams.get('next'));
    return sanitized ? `/signup?next=${encodeURIComponent(sanitized)}` : '/signup';
  }, [searchParams]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  const { focused, focusField, focusNext, autoFocusFirst, setRef, setFocused } =
    useTerminalForm({ fieldNames: ['email', 'password'] });

  useEffect(() => {
    const t = setTimeout(() => autoFocusFirst(), BOOT_LINES.length * 220 + 100);
    return () => clearTimeout(t);
  }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  async function onSubmit(e) {
    e?.preventDefault?.();
    if (loading || ok) return;
    setErr('');
    setOk('');
    if (!email || !password) {
      setErr('missing required field(s): email, password');
      return;
    }
    setLoading(true);
    try {
      const data = await apiFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      saveAuth(data.token, data.user);
      setOk('session authenticated. redirecting...');
      setTimeout(() => router.push(nextPath), 650);
    } catch (e2) {
      setErr(e2.message || 'invalid credentials');
      setLoading(false);
    }
  }

  return (
    <TerminalAuthLayout bootLines={BOOT_LINES}>
      <form
        onSubmit={onSubmit}
        onClick={() => focusField(focused)}
        className="mt-2 space-y-1"
      >
        <TerminalField
          command="login"
          label="--email"
          value={email}
          onClick={(e) => { e.stopPropagation(); focusField('email'); }}
          focused={focused === 'email'}
          placeholder="you@example.com"
          mask={false}
        />
        <input
          ref={setRef('email')}
          type="email"
          autoComplete="email"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onFocus={() => setFocused('email')}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusNext('email'); } }}
          className="sr-only-input"
          aria-label="email"
        />

        <TerminalField
          command="login"
          label="--password"
          value={password}
          onClick={(e) => { e.stopPropagation(); focusField('password'); }}
          focused={focused === 'password'}
          placeholder="••••••••"
          mask
        />
        <input
          ref={setRef('password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onFocus={() => setFocused('password')}
          onKeyDown={(e) => { if (e.key === 'Enter') onSubmit(e); }}
          className="sr-only-input"
          aria-label="password"
        />

        <TerminalError message={err} />
        <TerminalSuccess message={ok} />

        <div className="pt-4">
          <TerminalSubmitButton
            loading={loading}
            done={!!ok}
            loadingText="authenticating..."
            doneText="authenticated"
            defaultText="run login"
          />
        </div>

        <div className="pt-6 text-zinc-500">
          <span className="text-zinc-600"># </span>
          no account?{' '}
          <Link
            href="/signup"
            className="text-sky-400 hover:text-sky-300 underline decoration-dotted underline-offset-4"
          >
            signup --new
          </Link>
        </div>
      </form>
    </TerminalAuthLayout>
  );
}
