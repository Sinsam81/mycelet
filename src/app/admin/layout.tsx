import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { IKKE_INDEKSER } from '@/lib/seo/side-titler';

/**
 * Hele admin-området er noindex. Sidene setter egne titler; robots arves
 * herfra av alle som ikke setter sitt eget. Tilgangen styres ikke her, men i
 * middleware (PROTECTED_PATHS) og rollesjekken i hver side.
 */
export const metadata: Metadata = { robots: IKKE_INDEKSER };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
