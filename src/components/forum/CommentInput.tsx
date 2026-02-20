'use client';

import { FormEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  loading?: boolean;
}

export function CommentInput({ onSubmit, loading }: CommentInputProps) {
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError('Skriv en kommentar.');
      return;
    }

    try {
      await onSubmit(content.trim());
      setContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke sende kommentar.');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="sticky bottom-0 z-20 mt-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm">
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        rows={3}
        placeholder="Skriv en kommentar"
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" loading={loading}>
          Send kommentar
        </Button>
      </div>
    </form>
  );
}
