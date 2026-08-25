'use client';

import { useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api, money, when } from '@/lib/api';

interface PaymentRow {
  id: string; job_id: string; kind: string; status: string; amount_cents: string;
  platform_fee_cents: string; refunded_cents: string; failure_code: string | null; created_at: string;
}

interface PayoutRow {
  id: string; job_id: string; kind: string; status: string; amount_cents: string;
  platform_fee_cents: string; failure_code: string | null; created_at: string;
}

export default function PaymentsPage() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [payouts, setPayouts] = useState<PayoutRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api<{ items: PaymentRow[] }>('/admin/payments'),
      api<{ items: PayoutRow[] }>('/admin/payouts'),
    ])
      .then(([p, o]) => {
        setPayments(p.items);
        setPayouts(o.items);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Shell>
      <h2>Payments</h2>
      {error ? <div className="error">{error}</div> : null}

      <h3>Customer charges & refunds</h3>
      <table>
        <thead>
          <tr><th>Kind</th><th>Status</th><th>Amount</th><th>Platform fee</th><th>Refunded</th><th>Failure</th><th>At</th></tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td>{p.kind}</td>
              <td><StateBadge value={p.status} /></td>
              <td>{money(p.amount_cents)}</td>
              <td>{money(p.platform_fee_cents)}</td>
              <td>{money(p.refunded_cents)}</td>
              <td>{p.failure_code ?? '—'}</td>
              <td>{when(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ marginTop: 24 }}>Worker payouts</h3>
      <table>
        <thead>
          <tr><th>Kind</th><th>Status</th><th>Amount</th><th>Fee withheld</th><th>Failure</th><th>At</th></tr>
        </thead>
        <tbody>
          {payouts.map((p) => (
            <tr key={p.id}>
              <td>{p.kind}</td>
              <td><StateBadge value={p.status} /></td>
              <td>{money(p.amount_cents)}</td>
              <td>{money(p.platform_fee_cents)}</td>
              <td>{p.failure_code ?? '—'}</td>
              <td>{when(p.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
