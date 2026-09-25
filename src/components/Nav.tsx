'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';

const NAV_ITEMS = [
  { href: '/market', label: 'Market', icon: '◈' },
  { href: '/trade', label: 'Trade', icon: '⇄' },
  { href: '/portfolio', label: 'Portfolio', icon: '◉' },
  { href: '/leaderboard', label: 'Leaderboard', icon: '◆' },
];

export function Nav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/auth');
    router.refresh();
  };

  return (
    <>
      <nav className="nav" role="navigation" aria-label="Main navigation">
        <div className="nav-inner">
          {/* Logo */}
          <Link href="/market" className="nav-logo" aria-label="Tickr home">
            <div className="nav-logo-mark" aria-hidden="true">T↑</div>
            <span className="nav-logo-text">Tickr</span>
          </Link>

          {/* Links */}
          <ul className="nav-links" role="list">
            {NAV_ITEMS.map(({ href, label, icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  id={`nav-${label.toLowerCase()}`}
                  className={`nav-link ${pathname.startsWith(href) ? 'active' : ''}`}
                  aria-current={pathname.startsWith(href) ? 'page' : undefined}
                >
                  <span aria-hidden="true">{icon}</span>
                  <span>{label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {/* Right side */}
          <div className="nav-right">
            <span className="paper-badge" title="This is a paper trading simulation — no real money">
              Practice
            </span>
            {user ? (
              <button
                id="nav-sign-out"
                className="btn btn-ghost btn-sm"
                onClick={handleSignOut}
                disabled={signingOut}
                aria-label="Sign out"
              >
                {signingOut ? 'Signing out…' : 'Sign out'}
              </button>
            ) : (
              <Link
                id="nav-sign-in"
                href="/auth"
                className="btn btn-primary btn-sm"
              >
                Sign in
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Full-width paper trading banner */}
      <div className="paper-banner" role="banner" aria-label="Paper trading notice">
        <span aria-hidden="true">🎓</span>
        <strong>Paper Trading</strong>
        <span>—</span>
        <span>Simulated trades with real live prices. No real money involved.</span>
      </div>
    </>
  );
}
