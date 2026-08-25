'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { login, TotpRequiredError } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [needsTotp, setNeedsTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password, totpCode || undefined);
      router.replace('/');
    } catch (err) {
      if (err instanceof TotpRequiredError) {
        setNeedsTotp(true);
        if (totpCode) setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Sign-in failed');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <form className="login-box panel" onSubmit={submit}>
        <h2>Admin sign in</h2>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
        {needsTotp ? (
          <input
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="Authenticator code"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value)}
            autoComplete="one-time-code"
          />
        ) : null}
        {error ? <div className="error">{error}</div> : null}
        <button className="btn" disabled={busy || !email || !password}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
        <div className="muted">Admin accounts only. 2FA hardening lands before pilot (see SECURITY_MODEL).</div>
      </form>
    </div>
  );
}
