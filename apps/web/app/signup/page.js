'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiFetch } from '../../lib/api';
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
  'preparing new account registration...',
  'enter credentials below.',
];

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = useMemo(
    () => sanitizeNextPath(searchParams.get('next')),
    [searchParams]
  );
  const loginHref = nextPath
    ? `/login?next=${encodeURIComponent(nextPath)}`
    : '/login';
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
    if (password.length < 6) {
      setErr('password must be at least 6 characters');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/auth/signup', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      setOk('account created. redirecting to login...');
      setTimeout(() => router.push(loginHref), 650);
    } catch (e2) {
      setErr(e2.message || 'signup failed');
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
          command="signup"
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
          command="signup"
          label="--password"
          value={password}
          onClick={(e) => { e.stopPropagation(); focusField('password'); }}
          focused={focused === 'password'}
          placeholder="min 6 characters"
          mask
        />
        <input
          ref={setRef('password')}
          type="password"
          autoComplete="new-password"
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
            loadingText="creating account..."
            doneText="account created"
            defaultText="run signup"
          />
        </div>

        <div className="pt-6 text-zinc-500">
          <span className="text-zinc-600"># </span>
          already registered?{' '}
          <Link
            href={loginHref}
            className="text-sky-400 hover:text-sky-300 underline decoration-dotted underline-offset-4"
          >
            login --existing
          </Link>
        </div>
      </form>
    </TerminalAuthLayout>
  );
}
