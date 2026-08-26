import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { getUserLocale } from '@/i18n/locale';
import { intlLocale } from '@/lib/utils/intl-locale';
import { timeZoneForLocale } from '@/i18n/config';
import { getJoinedSpeciesName } from '@/lib/utils/species-name';
import { lagGpx, type GpxVeipunkt } from '@/lib/gpx/lag-gpx';

/**
 * GET /api/me/gpx — brukerens egne funn som GPX 1.1-veipunkter.
 *
 * Egen rute i stedet for props fra /mine-steder av to grunner fra
 * motstander-runden: (1) sidevisningen skal ikke frakte alle notatene i
 * RSC-payloaden på hver eneste visning for en fil de færreste laster ned;
 * (2) sidens 1000-raders visningstak skal ikke stille avkorte en eksport
 * brukeren behandler som komplett — her pagineres det forbi PostgREST-taket.
 *
 * Personvern: session-klienten under owner-RLS er ENESTE kilde (auth.uid() =
 * user_id) — eksakte koordinater ut av appen er kun lov for eierens egne
 * rader, samme presedens som /api/me/export. Ingen eksportvei skal noensinne
 * bygges på public_findings.
 */

const SIDE = 1000; // PostgREST-taket per svar
const MAKS_RADER = 10_000; // fornuftstak; ti sider dekker alle reelle brukere

type Rad = {
  latitude: number;
  longitude: number;
  found_at: string;
  location_name: string | null;
  notes: string | null;
  species_name_override: string | null;
  mushroom_species:
    | { norwegian_name: string | null; swedish_name: string | null }
    | { norwegian_name: string | null; swedish_name: string | null }[]
    | null;
};

export async function GET(request: NextRequest) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const rl = checkRateLimit(`gpx:${getClientKey(request, user.id)}`, 10, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  const locale = await getUserLocale();
  const rader: Rad[] = [];
  for (let fra = 0; fra < MAKS_RADER; fra += SIDE) {
    const { data, error } = await supabase
      .from('findings')
      .select(
        'latitude, longitude, found_at, location_name, notes, species_name_override, mushroom_species(norwegian_name,swedish_name)'
      )
      .eq('user_id', user.id)
      .eq('is_negative_observation', false)
      .order('found_at', { ascending: false })
      .range(fra, fra + SIDE - 1);
    if (error) {
      return NextResponse.json({ error: 'Kunne ikke hente funnene' }, { status: 500 });
    }
    const side = (data ?? []) as unknown as Rad[];
    rader.push(...side);
    if (side.length < SIDE) break;
  }

  const datoFormat = new Intl.DateTimeFormat(intlLocale(locale), {
    // Uten eksplisitt tidssone formaterer Vercel i UTC, og et nattfunn får
    // gårsdagens dato i veipunktnavnet — mens <time>-elementet ved siden av
    // viser riktig lokaltid på GPS-en.
    timeZone: timeZoneForLocale(locale),
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const veipunkter: GpxVeipunkt[] = rader.map((rad) => ({
    latitude: rad.latitude,
    longitude: rad.longitude,
    name: `${getJoinedSpeciesName(rad.mushroom_species, locale) || rad.species_name_override || 'Sopp'} ${datoFormat.format(new Date(rad.found_at))}`,
    time: rad.found_at,
    desc: [rad.location_name, rad.notes].filter(Boolean).join(' — ') || null
  }));

  return new NextResponse(lagGpx(veipunkter), {
    headers: {
      'Content-Type': 'application/gpx+xml; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mycelet-mine-steder.gpx"',
      'Cache-Control': 'private, no-store'
    }
  });
}
