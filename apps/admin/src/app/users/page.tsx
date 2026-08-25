'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api, when } from '@/lib/api';

interface UserRow {
  id: string;
  email: string;
  roles: string[];
  status: string;
  created_at: string;
  customer_name: string | null;
  worker_name: string | null;
}

export default function UsersPage() {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: UserRow[] }>(`/admin/users${query ? `?query=${encodeURIComponent(query)}` : ''}`);
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (user: UserRow, action: 'suspend' | 'restore') => {
    const reason = window.prompt(`Reason for ${action} (required, audited):`);
    if (!reason || reason.length < 5) return;
    try {
      await api(`/admin/users/${user.id}/${action}`, { method: 'POST', body: { reason } });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Shell>
      <h2>Users</h2>
      <div className="row">
        <input placeholder="Search email or name…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn secondary" onClick={load}>
          Search
        </button>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Roles</th>
            <th>Status</th>
            <th>Joined</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((u) => (
            <tr key={u.id}>
              <td>{u.email}</td>
              <td>{u.worker_name ?? u.customer_name ?? '—'}</td>
              <td>{u.roles.join(', ')}</td>
              <td>
                <StateBadge value={u.status} />
              </td>
              <td>{when(u.created_at)}</td>
              <td>
                {u.status === 'ACTIVE' ? (
                  <button className="btn danger" onClick={() => act(u, 'suspend')}>
                    Suspend
                  </button>
                ) : u.status === 'SUSPENDED' ? (
                  <button className="btn secondary" onClick={() => act(u, 'restore')}>
                    Restore
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
