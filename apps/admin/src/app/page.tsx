'use client';

import { useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { api, money } from '@/lib/api';

interface Overview {
  supply_demand: Record<string, string>;
  jobs: Record<string, string>;
  economics: Record<string, string>;
  trust: Record<string, string>;
  liquidity: Record<string, string | number | null>;
}

export default function OverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Overview>('/admin/metrics/overview').then(setData).catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Shell>
      <h2>Overview</h2>
      {error ? <div className="error">{error}</div> : null}
      {data ? (
        <>
          <div className="cards">
            <Card label="GMV" value={money(data.economics.gmv_cents)} />
            <Card label="Platform revenue" value={money(data.economics.revenue_cents)} />
            <Card label="Refunded" value={money(data.economics.refunded_cents)} />
            <Card label="Failed payments" value={data.economics.failed_payments} />
            <Card label="Active jobs" value={data.jobs.active_jobs} />
            <Card label="Completed jobs" value={data.jobs.completed_jobs} />
            <Card label="Cancelled jobs" value={data.jobs.cancelled_jobs} />
            <Card label="Awaiting review" value={data.jobs.jobs_awaiting_review} />
            <Card label="Disputed jobs" value={data.jobs.disputed_jobs} />
            <Card label="Customers" value={data.supply_demand.customers} />
            <Card label="Workers" value={data.supply_demand.workers} />
            <Card label="Available now" value={data.supply_demand.available_workers} />
            <Card label="Open disputes" value={data.trust.open_disputes} />
            <Card label="Open reports" value={data.trust.open_reports} />
            <Card label="Avg rating" value={data.trust.average_rating ?? '—'} />
            <Card
              label="Fill rate (30d)"
              value={
                data.liquidity.fill_rate_30d === null || data.liquidity.fill_rate_30d === undefined
                  ? '—'
                  : `${Math.round(Number(data.liquidity.fill_rate_30d) * 100)}%`
              }
            />
            <Card
              label="Avg time to fill"
              value={data.liquidity.avg_minutes_to_fill ? `${data.liquidity.avg_minutes_to_fill} min` : '—'}
            />
          </div>
          <div className="muted">
            Live figures computed from the system of record (jobs, payments, disputes, ratings).
          </div>
        </>
      ) : !error ? (
        <div className="muted">Loading…</div>
      ) : null}
    </Shell>
  );
}

function Card({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="card">
      <div className="label">{label}</div>
      <div className="value">{value ?? '—'}</div>
    </div>
  );
}
