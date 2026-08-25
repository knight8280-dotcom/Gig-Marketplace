'use client';

import { useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { api, when } from '@/lib/api';

interface AuditRow {
  id: string;
  actor_user_id: string | null;
  actor_type: string;
  action: string;
  entity_table: string | null;
  entity_id: string | null;
  reason: string | null;
  created_at: string;
}

export default function AuditPage() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: AuditRow[] }>('/admin/audit-logs')
      .then((res) => setItems(res.items))
      .catch((e: Error) => setError(e.message));
  }, []);

  return (
    <Shell>
      <h2>Audit log (append-only)</h2>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr><th>Action</th><th>Actor</th><th>Entity</th><th>Reason</th><th>At</th></tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="muted">
                No audited actions yet — admin mutations (suspensions, resolutions, settings changes)
                and security events appear here.
              </td>
            </tr>
          ) : null}
          {items.map((row) => (
            <tr key={row.id}>
              <td>{row.action}</td>
              <td className="muted">{row.actor_type}{row.actor_user_id ? ` · ${row.actor_user_id.slice(0, 8)}…` : ''}</td>
              <td className="muted">{row.entity_table ? `${row.entity_table} · ${(row.entity_id ?? '').slice(0, 8)}…` : '—'}</td>
              <td>{row.reason ?? '—'}</td>
              <td>{when(row.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
