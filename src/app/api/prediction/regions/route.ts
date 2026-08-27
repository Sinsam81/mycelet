import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { getSpeciesDisplayName } from '@/lib/utils/species-name';
import { scoreVerdict } from '@/lib/utils/prediction-explanation';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, isLocale, type Locale } from '@/i18n/config';
import { regionScore } from '@/lib/prediction/region-score';

/**
 * «Hvor i landet er det best akkurat nå?»
 *
 * DETTE ER DEN ENE ROMLIGE SAMMENLIGNINGEN MODELLEN FAKTISK BÆRER.
 *
 * Kartet kan ikke rangere skogholt mot skogholt — den romlige AUC-en er ~0,52,
 * og målt spenn INNE i ett kartutsnitt er median 7 poeng, smalere enn den
 * smaleste fargebøtta. Derfor ser kartet flatt ut uansett hva vi gjør med det.
 *
 * Men variasjonen finnes; den ligger bare et nivå over. Målt 2026-08-04 på
 * topp-10-%-ruta i hver region:
 *
 *     Bergen 81 · Stavanger 70 · Trondheim 59 · Växjö 54 · … · Oslo 34
 *
 * **47 poengs spenn mellom regioner, mot 7 inne i én.** Sju ganger større. Og
 * det er nettopp den forskjellen brukeren aldri fikk se, fordi kartet bare viser
 * ett utsnitt om gangen.
 *
 * En som står i Oslo i dag bør få vite at Vestlandet ligger 47 poeng over. Det
 * er et ærlig råd — det handler om FORHOLD (vær, sesong, fukt), ikke om at vi vet
 * hvor soppen står.
 *
 * Tallet per region er 90-persentilen, ikke snittet: spørsmålet er «hvor godt er
 * det der det er best i regionen», ikke «hvor godt er det i snitt over en
 * region som også inneholder fjord og by». Snittet ville straffet Bergen for
 * å ha sjø i rutenettet.
 */

export const runtime = 'nodejs';

interface TileRow {
  score: number;
  species_id: number | null;
  center_lat: number;
  center_lng: number;
  metadata: Record<string, unknown> | null;
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  const rl = checkRateLimit(`prediction-regions:${getClientKey(request, null)}`, 30, 60);
  if (!rl.allowed) return rateLimitResponse(rl);

  // Et eksplisitt ?locale= vinner over cookie/Accept-Language. De svenske
  // områdesidene under /soppforhold trenger det: deres språk følger REGIONEN,
  // ikke den besøkende, og server-side fetch har uansett ingen cookie å by på.
  // Parameteren gjør samtidig locale til en del av cache-NØKKELEN (URL-en) hos
  // kallere som cacher svaret — se i18n-regelen i CLAUDE.md.
  const bedt = request.nextUrl.searchParams.get('locale') ?? undefined;
  const locale: Locale = isLocale(bedt) ? bedt : ((await getUserLocale()) ?? DEFAULT_LOCALE);
  const supabase = createClient();

  // Flisene leses med tjenestenøkkelen, ikke kallerens sesjon.
  //
  // `prediction_tiles` er RLS-låst (migrasjon 015), og bare den SECURITY
  // DEFINER-merkede RPC-en slipper til — nettopp for at ikke hvem som helst skal
  // kunne laste ned hele rasteret med den offentlige anon-nøkkelen. Første
  // versjon av denne ruta leste tabellen direkte med sesjonsklienten og fikk
  // null rader tilbake, uten feilmelding. Samme mønster og samme begrunnelse
  // som i /api/prediction — se kommentaren der.
  //
  // Feiler admin-klienten (nøkkel mangler i miljøet), faller vi tilbake på
  // sesjonsklienten. Da blir svaret tomt i stedet for at ruta krasjer.
  const tileClient = (() => {
    try {
      return createAdminClient();
    } catch {
      log.warn('prediction_regions.admin_client_unavailable');
      return supabase;
    }
  })();

  // Nyeste rasterdato. Normalt i dag; i vinduet før nattens cron, gårsdagens.
  const { data: datoRad, error: datoErr } = await tileClient
    .from('prediction_tiles')
    .select('tile_date')
    .order('tile_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (datoErr) {
    log.error('prediction_regions.date_failed', { message: datoErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente rasterdato' }, { status: 500 });
  }
  const tileDate = datoRad?.tile_date as string | undefined;
  if (!tileDate) return NextResponse.json({ tileDate: null, regions: [] });

  // PostgREST kapper på 1000 rader uansett limit, så dette MÅ pagineres — ellers
  // ser en delvis lest side ut som at halve landet mangler fliser.
  const rows: TileRow[] = [];
  for (let side = 0; side < 20; side += 1) {
    const fra = side * 1000;
    const { data, error } = await tileClient
      .from('prediction_tiles')
      .select('score,species_id,center_lat,center_lng,metadata')
      .eq('tile_date', tileDate)
      .order('id', { ascending: true })
      .range(fra, fra + 999);
    if (error) {
      log.error('prediction_regions.tiles_failed', { message: error.message });
      return NextResponse.json({ error: 'Kunne ikke hente fliser' }, { status: 500 });
    }
    rows.push(...((data ?? []) as TileRow[]));
    if ((data ?? []).length < 1000) break;
  }

  // Beste art per rute først — ellers teller samme sted én gang per art, og en
  // region med mange arter i basen ser bedre ut enn en med få.
  const bestPerCelle = new Map<string, TileRow>();
  for (const r of rows) {
    const k = `${r.center_lat.toFixed(4)},${r.center_lng.toFixed(4)}`;
    const nå = bestPerCelle.get(k);
    if (!nå || r.score > nå.score) bestPerCelle.set(k, r);
  }

  const perRegion = new Map<string, TileRow[]>();
  for (const r of bestPerCelle.values()) {
    const navn = typeof r.metadata?.region === 'string' ? (r.metadata.region as string) : null;
    if (!navn) continue;
    const liste = perRegion.get(navn) ?? [];
    liste.push(r);
    perRegion.set(navn, liste);
  }

  const artsIder = [...new Set(rows.map((r) => r.species_id).filter((n): n is number => n != null))];
  const { data: arter } = artsIder.length
    ? await supabase
        .from('mushroom_species')
        .select('id,norwegian_name,swedish_name')
        .in('id', artsIder)
    : { data: [] };
  const navnPerArt = new Map<number, string>();
  for (const s of arter ?? []) {
    navnPerArt.set(
      s.id as number,
      getSpeciesDisplayName(
        { norwegian_name: s.norwegian_name as string | null, swedish_name: s.swedish_name as string | null },
        locale
      )
    );
  }

  const regions = [...perRegion.entries()]
    .map(([name, celler]) => {
      const konfig = PREDICTION_TILE_REGIONS.find((r) => r.name === name);
      const sortert = celler.map((c) => c.score).sort((a, b) => a - b);
      const score = regionScore(sortert);
      // Arten som drar toppen — et tall uten art er et svar uten spørsmål.
      const beste = celler.reduce((a, b) => (b.score > a.score ? b : a));
      return {
        name,
        country: konfig?.country ?? null,
        score,
        cells: celler.length,
        lat: konfig ? (konfig.minLat + konfig.maxLat) / 2 : beste.center_lat,
        lng: konfig ? (konfig.minLng + konfig.maxLng) / 2 : beste.center_lng,
        leadingSpecies: beste.species_id != null ? navnPerArt.get(beste.species_id) ?? null : null,
        verdict: scoreVerdict(
          score,
          locale,
          beste.species_id != null ? navnPerArt.get(beste.species_id) ?? undefined : undefined
        )
      };
    })
    .sort((a, b) => b.score - a.score);

  log.info('prediction_regions.success', { tileDate, regions: regions.length });
  return NextResponse.json({ tileDate, regions });
}
