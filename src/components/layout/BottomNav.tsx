'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Calendar, Home, Library, Map, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

const items = [
  { href: '/', label: 'Hjem', icon: Home },
  { href: '/species', label: 'Bibliotek', icon: Library },
  { href: '/map', label: 'Kart', icon: Map },
  { href: '/calendar', label: 'Kalender', icon: Calendar },
  { href: '/forum', label: 'Forum', icon: MessageSquare }
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-gray-200 bg-white/95 backdrop-blur">
      <ul className="mx-auto flex max-w-screen-md items-center justify-between px-3 py-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'flex min-w-14 flex-col items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors',
                  active ? 'text-forest-800' : 'text-gray-500 hover:text-gray-700'
                )}
              >
                <Icon className="h-5 w-5" />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
