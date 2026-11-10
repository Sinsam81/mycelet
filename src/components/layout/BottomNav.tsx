'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Calendar, Home, Library, Map, MessageSquare, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { FLAGS } from '@/lib/flags';

const items = [
  { href: '/', labelKey: 'home', icon: Home },
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

  return (
    <nav
      aria-label={t('ariaLabel')}
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
    >
      <ul className="mx-auto flex max-w-screen-md items-center justify-between px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
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
