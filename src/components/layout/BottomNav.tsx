'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calendar, Home, Library, Map, MessageSquare, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FLAGS } from '@/lib/flags';
import { useAuth } from '@/lib/hooks/useAuth';
import { useIsNative } from '@/lib/hooks/useIsNative';
import { HJEM, erAktiv, hjemHref } from '@/lib/nav/hjem';

const items = [
  { href: HJEM, labelKey: 'home', icon: Home },
  { href: '/species', labelKey: 'library', icon: Library },
  { href: '/map', labelKey: 'map', icon: Map },
  { href: '/calendar', labelKey: 'calendar', icon: Calendar },
  ...(FLAGS.forumInNav ? [{ href: '/forum', labelKey: 'forum', icon: MessageSquare }] : [])
];

/**
 * Innholdet i én fane. Egen komponent fordi useLinkStatus bare virker i en
 * etterkommer av <Link>.
 *
 * `pending` er sann fra trykket til den nye siden er på plass. Før sto fanen
 * umarkert helt til serveren hadde svart (usePathname endrer seg først da), så
 * et trykk på «Kart» med dårlig dekning så ut som om ingenting skjedde — og
 * inviterte til et trykk til. Nå lyser fanen med en gang.
 */
function FaneInnhold({ active, icon: Icon, label }: { active: boolean; icon: LucideIcon; label: string }) {
  const { pending } = useLinkStatus();
  const markert = active || pending;
  return (
    <>
      <span
        className={cn(
          'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
          markert ? 'bg-forest-100 text-forest-900' : 'bg-transparent'
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className={markert ? 'text-forest-900' : undefined}>{label}</span>
    </>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const t = useTranslations('BottomNav');
  const { user, loading } = useAuth();
  const native = useIsNative();
  // I appen er /soppforhold hjem for en som ikke er logget inn — «/» var en
  // full sidelasting via landingssiden og tilbake dit brukeren alt sto, uten at
  // noen fane lyste (src/lib/nav/hjem.ts). Mens innloggingen er ukjent står
  // «/», så en innlogget bruker aldri får /soppforhold i et øyeblikk. Begge
  // krokene svarer «ukjent»/«nett» på første tegning, som serverens HTML.
  const hjem = loading ? HJEM : hjemHref({ native, innlogget: Boolean(user) });

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-screen-md items-center justify-between px-3 py-2">
        {items.map((item) => {
          const href = item.labelKey === 'home' ? hjem : item.href;
          const active = erAktiv(pathname, href);

          return (
            // Nøkkelen er fanen, ikke adressen: Hjem bytter adresse når
            // innloggingen blir kjent, og skal ikke monteres på nytt av det.
            <li key={item.labelKey}>
              <Link
                href={href}
                // Aktiv fane ble bare vist med farge. Skjermlesere får den nå også.
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-w-14 flex-col items-center gap-0.5 rounded-xl px-2 py-1 text-xs font-medium transition-colors',
                  active ? 'text-forest-900' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <FaneInnhold active={active} icon={item.icon} label={t(item.labelKey)} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
