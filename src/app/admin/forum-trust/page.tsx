'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { PageWrapper } from '@/components/layout/PageWrapper';
import { Button } from '@/components/ui/Button';

type VerifiedRole = 'trusted_forager' | 'expert' | 'community_verifier' | 'moderator';

interface UserRow {
  id: string;
  username: string | null;
  displayName: string | null;
  verified: {
    user_id: string;
    role: VerifiedRole;
    badge_label: string | null;
    note: string | null;
  } | null;
}

const roleOptions: Array<{ value: VerifiedRole; label: string }> = [
  { value: 'trusted_forager', label: 'Verifisert plukker' },
  { value: 'expert', label: 'Ekspert' },
  { value: 'community_verifier', label: 'Fellesskapsverifisert' },
  { value: 'moderator', label: 'Moderator' }
];

function BadgeEditor({
  row,
  onSaved,
  onRemoved
}: {
  row: UserRow;
  onSaved: () => Promise<void>;
  onRemoved: () => Promise<void>;
}) {
  const [role, setRole] = useState<VerifiedRole>(row.verified?.role ?? 'trusted_forager');
  const [badgeLabel, setBadgeLabel] = useState(row.verified?.badge_label ?? '');
  const [note, setNote] = useState(row.verified?.note ?? '');
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setError(null);
    setSaving(true);
    try {
      const response = await fetch('/api/admin/verified-foragers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: row.id,
          role,
          badgeLabel,
          note
        })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Kunne ikke lagre');
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setError(null);
    setRemoving(true);
    try {
      const response = await fetch(`/api/admin/verified-foragers?userId=${encodeURIComponent(row.id)}`, {
        method: 'DELETE'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Kunne ikke fjerne');
      }
      await onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke fjerne');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <article className="rounded-lg border border-gray-200 bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-gray-900">{row.displayName || row.username || row.id.slice(0, 8)}</p>
          <p className="text-xs text-gray-600">@{row.username || 'ukjent'} • {row.id}</p>
        </div>
        {row.verified ? <span className="rounded-full bg-forest-50 px-2 py-0.5 text-xs text-forest-900">Aktiv badge</span> : null}
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
        <label className="text-xs font-medium text-gray-700">
          Rolle
          <select value={role} onChange={(e) => setRole(e.target.value as VerifiedRole)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm">
            {roleOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-gray-700">
          Badge label
          <input value={badgeLabel} onChange={(e) => setBadgeLabel(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="f.eks. Soppsakkyndig" />
        </label>
        <label className="text-xs font-medium text-gray-700">
          Notat
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-2 py-1.5 text-sm" placeholder="Intern merknad" />
        </label>
      </div>

      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      <div className="mt-3 flex gap-2">
        <Button size="sm" onClick={() => void save()} loading={saving}>
          Lagre badge
        </Button>
        <Button size="sm" variant="outline" onClick={() => void remove()} loading={removing}>
          Fjern badge
        </Button>
      </div>
    </article>
  );
}

export default function ForumTrustAdminPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<UserRow[]>([]);

  const queryString = useMemo(() => query.trim(), [query]);

  const loadRows = async () => {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (queryString.length >= 2) params.set('q', queryString);
      const response = await fetch(`/api/admin/verified-foragers?${params.toString()}`, {
        cache: 'no-store'
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error ?? 'Kunne ikke hente data');
      }
      setRows((data?.users ?? []) as UserRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke hente data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadRows();
  }, []);

  return (
    <PageWrapper>
      <section className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Forum trust admin</h1>
            <p className="text-sm text-gray-700">Tildel eller fjern verifiserte plukker-badges.</p>
          </div>
          <div className="flex gap-2">
            <Link href="/forum/moderation" className="text-sm font-medium text-forest-800 hover:underline">
              Moderasjon
            </Link>
            <Link href="/forum" className="text-sm font-medium text-forest-800 hover:underline">
              Forum
            </Link>
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full rounded border border-gray-300 py-2 pl-8 pr-3 text-sm"
                placeholder="Søk på brukernavn eller visningsnavn (minst 2 tegn)"
              />
            </div>
            <Button size="sm" onClick={() => void loadRows()}>
              Søk
            </Button>
          </div>
        </div>

        {loading ? (
          <p className="inline-flex items-center gap-2 text-sm text-gray-700">
            <Loader2 className="h-4 w-4 animate-spin" /> Laster brukere...
          </p>
        ) : null}
        {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

        <div className="space-y-2">
          {rows.map((row) => (
            <BadgeEditor key={row.id} row={row} onSaved={loadRows} onRemoved={loadRows} />
          ))}
        </div>

        {!loading && rows.length === 0 ? <p className="text-sm text-gray-700">Ingen brukere funnet.</p> : null}
      </section>
    </PageWrapper>
  );
}

