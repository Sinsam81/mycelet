/**
 * Rulleatferd som respekterer «Reduser bevegelse».
 *
 * `scroll-behavior: auto` i CSS (globals.css) overstyrer IKKE et eksplisitt
 * `behavior: 'smooth'` i scrollIntoView/scrollTo. Kall som ruller fra kode må
 * derfor spørre selv.
 */
export function rulleAtferd(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'smooth';
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}
