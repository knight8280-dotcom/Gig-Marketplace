'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell, StateBadge } from '@/components/shell';
import { api } from '@/lib/api';

interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  enabled: boolean;
  requires_identity_verification: boolean;
  requires_background_check: boolean;
}

export default function CategoriesPage() {
  const [items, setItems] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await api<{ items: Category[] }>('/admin/categories');
      setItems(res.items);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (category: Category) => {
    try {
      await api(`/admin/categories/${category.id}`, {
        method: 'PATCH',
        body: { enabled: !category.enabled },
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const create = async () => {
    try {
      await api('/admin/categories', { method: 'POST', body: { slug, name } });
      setSlug('');
      setName('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Shell>
      <h2>Categories</h2>
      <div className="panel">
        <div className="row">
          <input placeholder="slug (e.g. snow-removal)" value={slug} onChange={(e) => setSlug(e.target.value)} />
          <input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="btn" onClick={create} disabled={!slug || !name}>
            Create (disabled by default)
          </button>
        </div>
        <div className="muted">
          New categories start disabled — enable only after the legal checklist (LEGAL_COMPLIANCE L-8).
        </div>
      </div>
      {error ? <div className="error">{error}</div> : null}
      <table>
        <thead>
          <tr><th>Name</th><th>Slug</th><th>Status</th><th>Requirements</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td className="muted">{c.slug}</td>
              <td><StateBadge value={c.enabled ? 'ACTIVE' : 'PENDING'} /></td>
              <td>
                {c.requires_identity_verification ? <span className="badge warn">ID verification</span> : null}{' '}
                {c.requires_background_check ? <span className="badge warn">Background check</span> : null}
              </td>
              <td>
                <button className={`btn ${c.enabled ? 'danger' : ''}`} onClick={() => toggle(c)}>
                  {c.enabled ? 'Disable' : 'Enable'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Shell>
  );
}
