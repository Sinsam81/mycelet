'use client';

import { useMemo, useState } from 'react';
import { Share2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SharePostButtonProps {
  postId: string;
  title: string;
  findingName?: string | null;
  zoneLabel?: string | null;
}

function buildShareText(title: string, findingName?: string | null, zoneLabel?: string | null) {
  if (findingName && zoneLabel) {
    return `Fant ${findingName} i ${zoneLabel} via SoppJakt.`;
  }
  if (findingName) {
    return `Fant ${findingName} via SoppJakt.`;
  }
  return `${title} via SoppJakt.`;
}

export function SharePostButton({ postId, title, findingName, zoneLabel }: SharePostButtonProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const shareData = useMemo(() => {
    const url =
      typeof window !== 'undefined'
        ? `${window.location.origin}/forum/${postId}`
        : `/forum/${postId}`;
    return {
      title: `SoppJakt: ${title}`,
      text: buildShareText(title, findingName, zoneLabel),
      url
    };
  }, [findingName, postId, title, zoneLabel]);

  const share = async () => {
    setFeedback(null);

    try {
      if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        await navigator.share(shareData);
        setFeedback('Delt');
        return;
      }

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareData.url);
        setFeedback('Lenke kopiert');
        return;
      }

      setFeedback(shareData.url);
    } catch {
      setFeedback('Kunne ikke dele nå');
    }
  };

  return (
    <div className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={() => void share()} icon={<Share2 className="h-4 w-4" />}>
        Del funn
      </Button>
      {feedback ? <span className="text-xs text-gray-600">{feedback}</span> : null}
    </div>
  );
}

