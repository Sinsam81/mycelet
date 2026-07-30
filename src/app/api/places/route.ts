import { NextRequest, NextResponse } from 'next/server';
import { searchPlacesServer } from '@/lib/utils/place-search';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';

/**
 * Place-name search for the map (Norway + Sweden).
 *
 * Proxied through our own server on purpose:
 * - the CSP stays tight (no third-party host in the browser's connect-src),
 * - the upstream geocoder never sees users' IPs or raw search terms tied to
 *   them, which keeps the privacy policy's processor list honest,
 * - responses are cached, so repeated «Hamar» costs one upstream call.
 */

export const runtime = 'nodejs';
export const maxDuration = 15;

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const query = (request.nextUrl.searchParams.get('q') ?? '').trim();

  if (query.length < 2) {
    return NextResponse.json({ places: [] });
  }
  if (query.length > 80) {
    return NextResponse.json({ error: 'Søketekst for lang' }, { status: 400 });
  }

  // Typeahead fires often; keep it generous but bounded per client.
  const rl = checkRateLimit(`places:${getClientKey(request, null)}`, 60, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  try {
    const places = await searchPlacesServer(query);
    return NextResponse.json(
      { places },
      {
        headers: {
          // Place names are stable; let the CDN absorb repeat lookups.
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800'
        }
      }
    );
  } catch (error) {
    log.warn('places.search_failed', { message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ places: [] });
  }
}
