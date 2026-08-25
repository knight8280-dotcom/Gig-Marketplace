'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, hasSession } from '@/lib/api';

const NAV: Array<[string, string]> = [
  ['/', 'Overview'],
  ['/review-queue', 'Review queue'],
  ['/users', 'Users'],
  ['/jobs', 'Jobs'],
  ['/disputes', 'Disputes'],
  ['/reports', 'Reports'],
  ['/payments', 'Payments'],
  ['/categories', 'Categories'],
  ['/settings', 'Settings'],
  ['/audit', 'Audit log'],
];

/** Authenticated dashboard frame; redirects to /login without a session. */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!hasSession()) router.replace('/login');
    else setReady(true);
  }, [router]);

  if (!ready) return null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <h1>Gig Marketplace Ops</h1>
        <nav>
          {NAV.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? 'active' : ''}>
              {label}
            </Link>
          ))}
        </nav>
        <button
          className="signout"
          onClick={() => {
            clearSession();
            router.replace('/login');
          }}
        >
          Sign out
        </button>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function StateBadge({ value }: { value: string }) {
  const map: Record<string, string> = {
    ACTIVE: 'ok', PAID: 'ok', SUCCEEDED: 'ok', COMPLETED: 'ok', RESOLVED: 'ok', APPROVED: 'ok',
    IN_TRANSIT: 'info', MATCHING: 'info', FILLED: 'info', IN_PROGRESS: 'info', OPEN: 'info',
    POSTED: 'info', PARTIALLY_FILLED: 'info', PAYMENT_PENDING: 'info',
    PENDING_REVIEW: 'warn', COMPLETION_PENDING: 'warn', PENDING: 'warn', UNDER_REVIEW: 'warn',
    SUSPENDED: 'danger', FAILED: 'danger', CANCELLED: 'danger', DISPUTED: 'danger', REFUNDED: 'danger',
  };
  return <span className={`badge ${map[value] ?? ''}`}>{value.replaceAll('_', ' ')}</span>;
}
