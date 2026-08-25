'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api, money, when } from '@/lib/api';

interface JobRow {
  id: string;
  title: string;
  state: string;
  city: string;
  region: string;
  workers_needed: number;
  workers_filled: number;
  pay_type: string;
  pay_cents: string;
  scheduled_start_at: string | null;
  created_at: string;
}

export default function JobsPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<JobRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: JobRow[] }>(`/admin/jobs${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell>
      <h2>Jobs</h2>
      <div className="row">
        <input placeholder="Search title…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn secondary" onClick={load}>
          Search
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Title</th>
            <th>State</th>
            <th>Location</th>
            <th>Workers</th>
            <th>Pay</th>
            <th>Start</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {items.map((j) => (
            <tr key={j.id}>
              <td>
                <Link href={`/jobs/${j.id}`} style={{ color: 'var(--primary)', fontWeight: 600 }}>
                  {j.title}
                </Link>
              </td>
              <td>
                <StateBadge value={j.state} />
              </td>
              <td>
                {j.city}, {j.region}
              </td>
              <td>
                {j.workers_filled}/{j.workers_needed}
              </td>
              <td>
                {money(j.pay_cents)}
                {j.pay_type === 'HOURLY' ? '/hr' : ''}
              </td>
              <td>{j.scheduled_start_at ? when(j.scheduled_start_at) : 'ASAP'}</td>
              <td>{when(j.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
