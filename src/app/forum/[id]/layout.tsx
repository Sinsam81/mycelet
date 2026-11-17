import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { getUserLocale } from '@/i18n/locale';
import { createClient } from '@/lib/supabase/server';
import { sideMetadata } from '@/lib/seo/side-metadata';
import { privatSide, utdrag } from '@/lib/seo/side-titler';

interface Props {
  params: Promise<{ id: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Trådens fanetittel er innleggets egen tittel — men bare når leseren faktisk
 * kan åpne innlegget.
 *
 * Oppslaget går gjennom LESERENS økt, så RLS på forum_posts gjelder: et
 * skjult innlegg (is_hidden) og et innlegg fra en forfatter leseren har
 * blokkert kommer ikke tilbake. Policyen har ingen unntak for egne eller
 * modererte innlegg, så det leseren ser her er alltid også lesbart uten konto.
 * Alt annet — ukjent id, borte innlegg, en feil — gir en generisk tittel og
 * noindex, aldri en tittel fra et innlegg leseren ikke kunne lest.
 */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const locale = await getUserLocale();
  const t = await getTranslations({ locale, namespace: 'ForumThread' });
  const generisk = privatSide(t('metaTitleFallback'));
  if (!UUID.test(id)) return generisk;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('forum_posts')
      .select('title,content')
      .eq('id', id)
      .eq('is_hidden', false)
      .maybeSingle();
    const tittel = data?.title?.trim();
    if (error || !tittel) return generisk;

    const forum = await getTranslations({ locale, namespace: 'Forum' });
    return sideMetadata({
      sti: `/forum/${id}`,
      tittel,
      beskrivelse: utdrag(data?.content) ?? forum('metaDescription'),
      locale
    });
  } catch {
    return generisk;
  }
}

export default function ForumThreadLayout({ children }: { children: ReactNode }) {
  return children;
}
