'use client';

import { useCallback, useEffect, useState } from 'react';
import { Shell } from '@/components/shell';
import { api } from '@/lib/api';

const KEYS = [
  'completion_auto_confirm_hours',
  'cancellation_policy',
  'matching',
  'rating_blind_window_days',
  'discovery',
];

export default function SettingsPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const entries = await Promise.all(
        KEYS.map(async (key) => {
          const res = await api<{ value: unknown }>(`/admin/settings/${key}`);
          return [key, JSON.stringify(res.value, null, 2)] as const;
        }),
      );
      setValues(Object.fromEntries(entries));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (key: string) => {
    setError(null);
    setSaved(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(values[key] ?? '');
    } catch {
      setError(`"${key}" is not valid JSON`);
      return;
    }
    try {
      await api(`/admin/settings/${key}`, { method: 'PUT', body: { value: parsed } });
      setSaved(key);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <Shell>
      <h2>Platform settings</h2>
      <div className="muted" style={{ marginBottom: 14 }}>
        Every change is audited. Business rules read these live — no deploys needed.
      </div>
      {error ? <div className="error">{error}</div> : null}
      {KEYS.map((key) => (
        <div className="panel" key={key}>
          <h3>{key}</h3>
          <textarea
            rows={5}
            style={{ width: '100%', fontFamily: 'monospace' }}
            value={values[key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [key]: e.target.value }))}
          />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn" onClick={() => save(key)}>
              Save
            </button>
            {saved === key ? <span className="badge ok">Saved</span> : null}
          </div>
        </div>
      ))}
    </Shell>
  );
}
