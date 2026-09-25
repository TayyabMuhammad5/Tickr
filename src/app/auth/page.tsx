'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const supabase = createClient();

    if (mode === 'signup') {
      const { error: err } = await supabase.auth.signUp({ email, password });
      if (err) {
        setError(err.message);
      } else {
        setSuccess('Account created! Signing you in…');
        // Auto-sign-in after signup (email confirm disabled)
        await supabase.auth.signInWithPassword({ email, password });
        router.push('/market');
        router.refresh();
      }
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
      } else {
        router.push('/market');
        router.refresh();
      }
    }

    setLoading(false);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        {/* Logo */}
        <div className="auth-logo">
          <div className="auth-logo-mark" aria-hidden="true">T↑</div>
        </div>

        <h1 className="auth-title" style={{ fontSize: '1.625rem' }}>
          {mode === 'signin' ? 'Welcome back' : 'Start practicing'}
        </h1>
        <p className="auth-subtitle">
          {mode === 'signin'
            ? 'Sign in to your Tickr account'
            : 'Create a free account — get $10,000 in practice cash'}
        </p>

        {/* Paper trading notice */}
        <div className="alert alert-info" style={{ marginBottom: '1.5rem' }}>
          <span aria-hidden="true">🎓</span>
          <span>
            <strong>Paper trading only</strong> — this is a simulator. No real
            money is involved at any point.
          </span>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} id="auth-form">
          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email address</label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              disabled={loading}
            />
          </div>

          {error && (
            <div id="auth-error" className="alert alert-error" role="alert">
              <span aria-hidden="true">⚠</span> {error}
            </div>
          )}

          {success && (
            <div id="auth-success" className="alert alert-success" role="status">
              <span aria-hidden="true">✓</span> {success}
            </div>
          )}

          <button
            id="auth-submit"
            type="submit"
            className={`btn btn-primary btn-lg btn-block`}
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner" aria-hidden="true" />
                {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
              </>
            ) : mode === 'signin' ? (
              'Sign in'
            ) : (
              'Create account & start trading'
            )}
          </button>
        </form>

        <div className="auth-divider" style={{ marginTop: '1.5rem' }}>or</div>

        <div className="auth-switch">
          {mode === 'signin' ? (
            <>
              No account?{' '}
              <button id="auth-switch-to-signup" onClick={() => { setMode('signup'); setError(null); }}>
                Sign up free
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button id="auth-switch-to-signin" onClick={() => { setMode('signin'); setError(null); }}>
                Sign in
              </button>
            </>
          )}
        </div>

        {/* Demo credentials hint */}
        <div className="auth-divider" style={{ marginTop: '1.25rem' }}>demo</div>
        <p style={{ textAlign: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', marginTop: '0.75rem' }}>
          demo@tickr.dev / demo1234
        </p>
      </div>
    </div>
  );
}
