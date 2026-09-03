import { SANKETIPS } from '@/lib/sanketips/manifest.generated';
import { byggLlmsTekst } from '@/lib/sanketips/llms';

/**
 * /llms.txt — generert fra artikkelmanifestet, se src/lib/sanketips/llms.ts.
 * Erstatter den håndskrevne public/llms.txt som sto og ble utdatert.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(byggLlmsTekst(SANKETIPS), {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}
