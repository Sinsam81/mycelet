import { SANKETIPS } from '@/lib/sanketips/manifest.generated';
import { SANKETIPS_FULLTEKST } from '@/lib/sanketips/fulltekst.generated';
import { byggLlmsFullTekst } from '@/lib/sanketips/llms';

/**
 * /llms-full.txt — alle artiklene i markdown, for AI-crawlere som vil ha
 * innholdet uten å parse HTML. Kildeteksten er content/sanketips/*.md, båret
 * hit av scripts/build-articles.mjs.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(byggLlmsFullTekst(SANKETIPS, SANKETIPS_FULLTEKST), {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}
