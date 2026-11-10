/**
 * Vent et antall millisekunder. Egen modul så en rute som tar en kort pause
 * før et nytt forsøk kan testes uten å stå og vente: testen bytter den ut med
 * `vi.mock('@/lib/utils/vent', …)`.
 */
export function vent(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
