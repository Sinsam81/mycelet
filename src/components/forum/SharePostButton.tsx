'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SharePostButtonProps {
  postId: string;
  title: string;
  findingName?: string | null;
  zoneLabel?: string | null;
}

export function SharePostButton({ postId, title, findingName, zoneLabel }: SharePostButtonProps) {
  const t = useTranslations('SharePostButton');
  const [feedback, setFeedback] = useState<string | null>(null);

  const buildShareText = (title: string, findingName?: string | null, zoneLabel?: string | null) => {
    if (findingName && zoneLabel) {
      return t('shareTextFindingZone', { findingName, zoneLabel });
    }
    if (findingName) {
      return t('shareTextFinding', { findingName });
    }
    return t('shareTextTitle', { title });
  };

  const shareData = useMemo(() => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/forum/${postId}`
        : `/forum/${postId}`;
    return {
      title: t('shareTitle', { title }),
      text: buildShareText(title, findingName, zoneLabel),
      url
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [findingName, postId, title, zoneLabel]);

  const share = async () => {
    setFeedback(null);

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share(shareData);
        setFeedback(t('shared'));
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        setFeedback(t('linkCopied'));
        return;
      }

      setFeedback(shareData.url);
    } catch {
      setFeedback(t('shareFailed'));
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void share()} icon={<Share2 className="h-4 w-4" />}>
        {t('shareFinding')}
      </Button>
      {feedback ? <span className="text-xs text-gray-600">{feedback}</span> : null}
    </div>
  );
}

