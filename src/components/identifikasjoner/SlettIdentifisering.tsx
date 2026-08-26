'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Sletteknappen på ett historikkort.
 *
 * Bekreftelsen er et window.confirm og ikke en egen dialog med vilje: dette er
 * en liten, reversibel-nok handling (funnet, hvis det finnes, blir liggende),
 * og en modal per kort ville vært mer maskineri enn saken er verdt. Teksten
 * sier eksplisitt at bildet går med, og at et lagret funn IKKE gjør det.
 *
 * router.refresh() i stedet for lokal state: lista er en serverkomponent, og
 * en optimistisk fjerning her ville kunnet vise en tom liste selv om
 * slettingen på serveren stoppet halvveis (bildet lot seg ikke fjerne — se
 * DELETE-ruta, som da beholder raden med vilje).
 */
export function SlettIdentifisering({ id }: { id: string }) {
  const t = useTranslations('Identifiseringer');
  const router = useRouter();
  const [sletter, setSletter] = useState(false);

  return (
    <button
      type="button"
      disabled={sletter}
      onClick={async () => {
        if (!window.confirm(t('deleteConfirm'))) return;
        setSletter(true);
        try {
          const res = await fetch(`/api/identifications/${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (!res.ok) throw new Error('delete failed');
          toast.success(t('deleted'));
          router.refresh();
        } catch {
          toast.error(t('deleteFailed'));
        } finally {
          setSletter(false);
        }
      }}
      className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-gray-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-40"
    >
      <Trash2 className="h-3.5 w-3.5" aria-hidden />
      {t('delete')}
    </button>
  );
}
