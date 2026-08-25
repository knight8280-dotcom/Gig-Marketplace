'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api, money, when } from '@/lib/api';

interface JobDetail {
  id: string;
  title: string;
  description: string;
  state: string;
  city: string;
  region: string;
  address_line1: string;
  workers_needed: number;
  workers_filled: number;
  pay_type: string;
  pay_cents: number;
  scheduled_start_at: string | null;
  assignments: Array<{ id: string; worker_user_id: string; state: string; earnings_cents: string | null }>;
  timeline: Array<{ id: string; event_type: string; from_state: string | null; to_state: string | null; created_at: string }>;
  payments: Array<{ id: string; kind: string; status: string; amount_cents: string; platform_fee_cents: string; refunded_cents: string; failure_code: string | null; created_at: string }>;
}

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<JobDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<JobDetail>(`/admin/jobs/${id}`).then(setJob).catch((e: Error) => setError(e.message));
  }, [id]);

  return (
    <Shell>
      {error ? <div className="error">{error}</div> : null}
      {job ? (
        <>
          <h2>
            {job.title} <StateBadge value={job.state} />
          </h2>
          <div className="panel">
            <div className="muted">{job.address_line1}, {job.city}, {job.region}</div>
            <p>{job.description}</p>
            <div>
              {money(job.pay_cents)}{job.pay_type === 'HOURLY' ? '/hr' : ''} · {job.workers_filled}/{job.workers_needed} workers ·{' '}
              {job.scheduled_start_at ? when(job.scheduled_start_at) : 'ASAP'}
            </div>
          </div>

          <div className="panel">
            <h3>Assignments</h3>
            <table>
              <thead>
                <tr><th>Worker</th><th>State</th><th>Earnings</th></tr>
              </thead>
              <tbody>
                {job.assignments.map((a) => (
                  <tr key={a.id}>
                    <td className="muted">{a.worker_user_id}</td>
                    <td><StateBadge value={a.state} /></td>
                    <td>{a.earnings_cents ? money(a.earnings_cents) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="panel">
            <h3>Payments</h3>
            <table>
              <thead>
                <tr><th>Kind</th><th>Status</th><th>Amount</th><th>Fee</th><th>Refunded</th><th>Failure</th><th>At</th></tr>
              </thead>
              <tbody>
                {job.payments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="muted">
                      No payments recorded — jobs are charged when they fill (or when work starts on a
                      partially staffed job).
                    </td>
                  </tr>
                ) : null}
                {job.payments.map((p) => (
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
          </div>

          <div className="panel">
            <h3>Timeline (immutable)</h3>
            <table>
              <thead>
                <tr><th>Event</th><th>Transition</th><th>At</th></tr>
              </thead>
              <tbody>
                {job.timeline.map((e) => (
                  <tr key={e.id}>
                    <td>{e.event_type}</td>
                    <td className="muted">{e.from_state && e.to_state ? `${e.from_state} → ${e.to_state}` : '—'}</td>
                    <td>{when(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : !error ? (
        <div className="muted">Loading…</div>
      ) : null}
    </Shell>
  );
}
