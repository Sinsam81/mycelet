import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { tellGbif } from '@/lib/alerts/fasit';
import { PULS_AAR_TILBAKE, beregnPuls, pulsVindu } from '@/lib/rapportpuls/puls';

/**
 * Rapportpuls (migrasjon 069): for hvert norsk område, hvor mange soppfunn
 * (alle arter) folk registrerte i Artsobservasjoner/GBIF i uka som gikk
 * (vinduet slutter sju dager tilbake — GBIF fyller på i ~en uke), mot samme
 * vindu de tre foregående årene og mot raden fra sju dager tidligere (samme
 * alder). Kjøres før soppvarselet, så e-posten kan forklare med ferskt tall.
 * Bare Norge: Sverige leverer til GBIF med ukers etterslep.
 *
 * ~12 områder × 4 GBIF-kall — godt innenfor fair use. Ett mislykket kall
 * prøves én gang til; feiler dagens tall, hoppes området over (ingen rad).
 */

export const maxDuration = 300;

async function tellMedRetry(region: (typeof PREDICTION_TILE_REGIONS)[number], fra: string, til: string): Promise<number | null> {
  const forste = await tellGbif(region, fra, til);
  if (forste !== null) return forste;
  await new Promise((r) => setTimeout(r, 1500));
  return tellGbif(region, fra, til);
}

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }
  const db = createAdminClient();
  const iDag = new Date().toISOString().slice(0, 10);
  const forrigeDag = new Date(Date.parse(`${iDag}T00:00:00Z`) - 7 * 86_400_000).toISOString().slice(0, 10);
  const regioner = PREDICTION_TILE_REGIONS.filter((r) => r.country === 'NO');

  // Forrige ukes rader (samme alder) — én lesing for alle områder.
  const { data: forrigeRader, error: leseFeil } = await db
    .from('rapportpuls')
    .select('region,siste7')
    .eq('dag', forrigeDag)
    .in('region', regioner.map((r) => r.name));
  if (leseFeil) log.warn('rapportpuls.forrige_uke_feilet', { message: leseFeil.message });
  const forrigeUke = new Map<string, number>((forrigeRader ?? []).map((r) => [String(r.region), Number(r.siste7)]));

  const resultat: Array<{ region: string; siste7: number; avvikPst: number | null; trendPst: number | null; nivaa: string }> = [];
  for (const region of regioner) {
    const vinduer = Array.from({ length: PULS_AAR_TILBAKE + 1 }, (_, aar) => pulsVindu(iDag, aar));
    const [siste7, ...tidligereAar] = await Promise.all(vinduer.map((v) => tellMedRetry(region, v.fra, v.til)));
    if (siste7 === null) {
      log.warn('rapportpuls.gbif_feilet', { region: region.name });
      continue;
    }
    const puls = beregnPuls({ ...vinduer[0], siste7, tidligereAar, forrigeUke: forrigeUke.get(region.name) ?? null });
    const { error } = await db.from('rapportpuls').upsert(
      {
        region: region.name,
        dag: iDag,
        fra: puls.fra,
        til: puls.til,
        siste7: puls.siste7,
        baseline: puls.baseline,
        avvik_pst: puls.avvikPst,
        aar_brukt: puls.aarBrukt,
        forrige_uke: puls.forrigeUke,
        trend_pst: puls.trendPst
      },
      { onConflict: 'region,dag' }
    );
    if (error) log.warn('rapportpuls.lagring_feilet', { region: region.name, message: error.message });
    resultat.push({ region: region.name, siste7: puls.siste7, avvikPst: puls.avvikPst, trendPst: puls.trendPst, nivaa: puls.nivaa });
  }

  log.info('rapportpuls.ferdig', {
    regioner: resultat.length,
    av: regioner.length,
    over: resultat.filter((r) => r.nivaa === 'over').length
  });
  return NextResponse.json({ ok: true, dag: iDag, resultat });
}
