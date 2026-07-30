'use client';

import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/Button';
import { checkContent, isProhibitedContentError } from '@/lib/moderation/content-filter';

interface CommentInputProps {
  onSubmit: (content: string) => Promise<void>;
  loading?: boolean;
}

export function CommentInput({ onSubmit, loading }: CommentInputProps) {
  const t = useTranslations('CommentInput');
  const tFilter = useTranslations('ContentFilter');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!content.trim()) {
      setError(t('emptyError'));
      return;
    }

    // Same pre-publication filter as posts (App Review 1.2); the database
    // trigger enforces it regardless of what the client does.
    const check = checkContent(content);
    if (!check.ok) {
      setError(tFilter('controlledSubstanceTrade'));
      return;
    }

    try {
      await onSubmit(content.trim());
      setContent('');
    } catch (err) {
      if (isProhibitedContentError(err)) {
        setError(tFilter('controlledSubstanceTrade'));
        return;
      }
      setError(err instanceof Error ? err.message : t('submitError'));
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-20 mt-3 rounded-2xl border border-gray-200 bg-white p-3 shadow-card"
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        rows={3}
        placeholder={t('placeholder')}
      />
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-2 flex justify-end">
        <Button type="submit" size="sm" loading={loading}>
          {t('submit')}
        </Button>
      </div>
    </form>
  );
}
