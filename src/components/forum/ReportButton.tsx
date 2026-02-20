'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { ReportReason } from '@/types/forum';

interface ReportButtonProps {
  label?: string;
  onSubmit: (payload: { reason: ReportReason; description?: string }) => Promise<void>;
}

const reasons: Array<{ value: ReportReason; label: string }> = [
  { value: 'spam', label: 'Spam' },
  { value: 'inappropriate', label: 'Upassende innhold' },
  { value: 'misinformation', label: 'Feilinformasjon' },
  { value: 'dangerous_advice', label: 'Farlige råd' },
  { value: 'harassment', label: 'Trakassering' },
  { value: 'other', label: 'Annet' }
];

export function ReportButton({ label = 'Rapporter', onSubmit }: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('misinformation');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);
    setLoading(true);

    try {
      await onSubmit({ reason, description: description.trim() || undefined });
      setSuccess(true);
      setDescription('');
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende rapport.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-red-700 hover:underline">
        {label}
      </button>

      {open ? (
        <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-2">
          <select
            value={reason}
            onChange={(event) => setReason(event.target.value as ReportReason)}
            className="w-full rounded border border-red-200 px-2 py-1 text-sm"
          >
            {reasons.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            className="w-full rounded border border-red-200 px-2 py-1 text-sm"
            placeholder="Beskriv problemet (valgfritt)"
          />

          {error ? <p className="text-xs text-red-700">{error}</p> : null}

          <Button type="submit" size="sm" variant="danger" loading={loading}>
            Send rapport
          </Button>
        </form>
      ) : null}

      {success ? <p className="text-xs text-emerald-700">Rapport sendt.</p> : null}
    </div>
  );
}
