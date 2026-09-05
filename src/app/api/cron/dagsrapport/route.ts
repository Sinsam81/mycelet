import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { bearerSecretMatches } from '@/lib/security/secret-compare';
import { byggDagsrapport, UKJENT_KILDE, type AbonnementRad, type BruksdagRad, type Dagsrapport, type VarselAbonnentRad } from '@/lib/rapport/dagsrapport';
import { osloDag } from '@/lib/bruk/bruksdag';
import { normaliserKilde } from '@/lib/analytics/kilde';
import { sendEpost } from '@/lib/email/send';

/**
 * Dagsrapport til eieren: hva skjedde med Mycelet i går?
 *
 * ── HVORFOR I APPEN OG IKKE SOM EN JOBB PÅ EN MASKIN ───────────────────────
 *
 * Det opplagte er en planlagt oppgave lokalt. Den dør den dagen maskinen byttes
 * ut, står avslått, eller er på et fly. Arbeidet flyttet fra én Mac til en annen
 * 10. august; en rapport som ikke overlever det, er ikke en rapport.
 *
 * Her går den på samme Vercel-cron som soppvarselet, leser samme database, og
 * bruker samme Resend-oppsett. Ingenting å skru på, ingenting å huske.
 *
 * ── HVA DEN IKKE KAN SVARE PÅ ──────────────────────────────────────────────
 *
 * ⚠️ BESØKSTALL FOR FORSIDEN MANGLER, og rapporten sier det selv i stedet for å
 * tie om det. Den utloggede forsiden er `public/landing/index.html`, servert via
 * en middleware-omskriving, og den har NULL JavaScript med vilje — derfor kjører
 * ikke Google Analytics der. `src/lib/supabase/middleware.ts` logger riktignok
 * hvert besøk med hvor det kom fra, men det går til Vercel-loggen, som ikke lar
 * seg summere herfra.
 *
 * Å telle dem krever en teller i databasen skrevet fra middleware. Det er en
 * endring i den varmeste kodestien vi har, og den er ikke gjort. Rapporten
 * skriver «ikke målt» heller enn å la et tomt felt se ut som null besøk.
 *
 * ── MEN: REGISTRERINGER PER KILDE ER MÅLT (fra september 2026) ─────────────
 *
 * Forsidebesøket setter cookien `mycelet_kilde`, signUp legger den i
 * user_metadata, og her leses den ut igjen — se src/lib/analytics/kilde.ts.
 * Det svarer på det annonsetesten (docs/google-ads-test.md) trenger: hvor
 * mange av dem som kom via annonsen registrerte seg, og betalte. «ukjent» er
 * direkte besøk pluss alle som registrerte seg før målingen startet.
 */

export const maxDuration = 60;

/** Rapporten går hit. Ingen andre skal ha den — den inneholder forretningstall. */
const MOTTAKER = 'post@mycelet.com';

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);

  if (!bearerSecretMatches(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Ikke autorisert' }, { status: 401 });
  }

  const db = createAdminClient();
  const naa = new Date();

  // ── Brukere ───────────────────────────────────────────────────────────────
  // auth.users er ikke eksponert gjennom PostgREST; admin-API-et er veien inn.
  const { data: brukerData, error: brukerErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (brukerErr) {
    log.error('dagsrapport.brukere_feilet', { message: brukerErr.message });
    return NextResponse.json({ error: 'Kunne ikke hente brukere' }, { status: 500 });
  }
  const brukere = (brukerData?.users ?? []).map((u) => ({
    id: u.id,
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    kilde: normaliserKilde(u.user_metadata?.kilde)
  }));

  // ── Abonnement ────────────────────────────────────────────────────────────
  const { data: abData } = await db
    .from('billing_subscriptions')
    .select('user_id,tier,status,current_period_end,created_at,metadata');

  // ── Varselabonnement ──────────────────────────────────────────────────────
  // Radene, ikke bare tallet: kilde, region og aktivering er det strategien
  // måler på. Ingen e-postadresser hentes.
  // PostgREST kapper på 1000 rader uansett range — paginert som i
  // soppvarsel-cronen, ellers forsvinner de nyeste påmeldingene stille.
  const varselabonnenter: VarselAbonnentRad[] = [];
  for (let side = 0; side < 20; side += 1) {
    const fra = side * 1000;
    const { data: varselRader } = await db
      .from('alert_subscriptions')
      .select('user_id,region,active,confirmed_at,created_at,last_notified_at,forste_apnet_at,kilde')
      .order('id', { ascending: true })
      .range(fra, fra + 999);
    varselabonnenter.push(...((varselRader ?? []) as VarselAbonnentRad[]));
    if ((varselRader ?? []).length < 1000) break;
  }
  const varselAntall = varselabonnenter.filter((r) => r.active).length;

  // ── Bruksdager siste 28 dager ─────────────────────────────────────────────
  // Mangler tabellen (migrasjonen ikke kjørt), sier rapporten «ikke målt» i
  // stedet for å vise null — null ser ut som «ingen bruker det».
  const bruksGrense = osloDag(new Date(naa.getTime() - 27 * 24 * 3600_000));
  const MAKS_SIDER = 50;
  const samledeBruksdager: BruksdagRad[] = [];
  let bruksdagerMaalt = true;
  for (let side = 0; side < MAKS_SIDER; side += 1) {
    const fra = side * 1000;
    const { data: bruksRader, error: bruksErr } = await db
      .from('bruksdager')
      .select('user_id,dag,flate')
      .gte('dag', bruksGrense)
      .order('dag', { ascending: true })
      .order('user_id', { ascending: true })
      .order('flate', { ascending: true })
      .order('omrade', { ascending: true })
      .range(fra, fra + 999);
    if (bruksErr) {
      log.warn('dagsrapport.bruksdager_feilet', { message: bruksErr.message });
      bruksdagerMaalt = false;
      break;
    }
    samledeBruksdager.push(...((bruksRader ?? []) as BruksdagRad[]));
    if ((bruksRader ?? []).length < 1000) break;
    if (side === MAKS_SIDER - 1) {
      // Mer enn 50 000 rader på 28 dager: heller «ikke målt» enn et tall som er for lavt.
      log.warn('dagsrapport.bruksdager_avkortet', { sider: MAKS_SIDER });
      bruksdagerMaalt = false;
    }
  }
  const bruksdager = bruksdagerMaalt ? samledeBruksdager : undefined;

  // ── Regionscorer, i dag og i går ──────────────────────────────────────────
  const { data: scorer } = await db
    .from('region_daily_scores')
    .select('region,tile_date,score')
    .order('tile_date', { ascending: false })
    .limit(60);

  const datoer = [...new Set((scorer ?? []).map((s) => s.tile_date as string))].sort().reverse();
  const iDagDato = datoer[0];
  const iGarDato = datoer[1];
  const velg = (d: string | undefined) =>
    d ? (scorer ?? []).filter((s) => s.tile_date === d).map((s) => ({ region: s.region as string, score: s.score as number })) : [];

  const rapport = byggDagsrapport({
    brukere,
    abonnement: (abData ?? []) as AbonnementRad[],
    varselabonnement: varselAntall,
    varselabonnenter,
    bruksdager,
    regionerIDag: velg(iDagDato),
    regionerIGar: velg(iGarDato),
    naa
  });

  const { emne, html, tekst } = byggRapportEpost(rapport, naa);
  const res = await sendEpost({ til: MOTTAKER, emne, html, tekst });

  log.info('dagsrapport.ferdig', {
    sendt: res.ok,
    nyeBrukere24t: rapport.nyeBrukere.siste24t,
    betalende: rapport.betalende.totalt,
    flanker: rapport.flanker.length
  });

  return NextResponse.json({ ok: true, sendt: res.ok, detalj: res.detalj, rapport });
}

/**
 * E-posten. Bevisst nøktern: dette er et arbeidsverktøy, ikke markedsføring.
 * Tallene skal kunne leses på en telefon på tre sekunder.
 */
function byggRapportEpost(r: Dagsrapport, naa: Date) {
  const dato = naa.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' });
  const b = r.betalende;

  const overskrift =
    r.nyeBrukere.siste24t > 0
      ? `${r.nyeBrukere.siste24t} ny${r.nyeBrukere.siste24t === 1 ? '' : 'e'} bruker${r.nyeBrukere.siste24t === 1 ? '' : 'e'} i går`
      : 'Ingen nye brukere i går';

  // Alt som havner i tabellen er tekst fra databasen (kilder, regioner) —
  // aldri markup. Rensingen i byggDagsrapport er første lag; dette er andre.
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const rad = (navn: string, verdi: string) =>
    `<tr><td style="padding:6px 0;color:#4b5563">${esc(navn)}</td><td style="padding:6px 0;text-align:right;font-weight:600;color:#1A3409">${esc(verdi)}</td></tr>`;

  const flankeTekst = r.flanker.length
    ? r.flanker.map((f) => `${f.region} ${f.fra} → ${f.til}`).join(', ')
    : 'ingen';

  // Hvor de kom fra. Én linje per kilde: «12 · 3 siste 7 d · 1 betaler».
  const kildeNavn = (k: string) => (k === UKJENT_KILDE ? 'direkte / ukjent' : k);
  const kildeVerdi = (k: Dagsrapport['kilder'][number]) =>
    `${k.totalt} · ${k.siste7d} siste 7 d · ${k.betalende} betaler`;
  const kildeRader = r.kilder.slice(0, 8);
  const v = r.varsel;
  const u = r.bruk;
  const brukRader: Array<[string, string]> = u.maalt
    ? [
        ['Så forholdene siste 7 dager', `${u.brukereSiste7d} brukere`],
        ['— forsiden / kartet / områdeside', `${u.perFlate.hjem} / ${u.perFlate.kart} / ${u.perFlate.omrade}`],
        ['Nye siste 14 d som kom tilbake', `${u.komTilbake} av ${u.nyeSiste14d}`],
        ...u.perKilde.slice(0, 6).map((k): [string, string] => [`— ${kildeNavn(k.kilde)}`, `${k.komTilbake} av ${k.nye}`]),
        ['Brukt i to ulike uker (28 d)', String(u.gjenbruk28d)]
      ]
    : [['Bruk av soppforholdene', 'ikke målt — tabellen bruksdager svarte ikke']];

  const html = `<!doctype html>
<html lang="nb"><body style="font-family:-apple-system,system-ui,sans-serif;color:#1f2937;max-width:520px;margin:24px auto;padding:0 16px">
  <p style="font-size:12px;color:#6b7280;margin:0">Mycelet · ${dato}</p>
  <h1 style="font-size:19px;color:#1A3409;margin:4px 0 18px">${overskrift}</h1>

  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rad('Nye brukere siste døgn', String(r.nyeBrukere.siste24t))}
    ${rad('Nye siste 7 dager', String(r.nyeBrukere.siste7d))}
    ${rad('Registrerte totalt', String(r.nyeBrukere.totalt))}
    ${rad('…som aldri logget inn igjen', String(r.aldriInnloggetIgjen))}
  </table>

  <h2 style="font-size:14px;color:#1A3409;margin:22px 0 6px">Abonnement</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rad('Løpende totalt', String(b.totalt))}
    ${rad('— betalt via Stripe', String(b.perKilde.stripe))}
    ${rad('— betalt via App Store', String(b.perKilde.revenuecat))}
    ${rad('— gavepass og testkontoer', String(b.perKilde.manuell))}
    ${rad('Nye ekte kjøp siste 7 dager', String(b.nyeSiste7d))}
    ${r.utloptMenMarkertAktiv > 0 ? rad('⚠️ utløpt, men merket aktiv', String(r.utloptMenMarkertAktiv)) : ''}
  </table>

  <h2 style="font-size:14px;color:#1A3409;margin:22px 0 6px">I skogen</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rad('Best i dag', r.toppRegioner.map((t) => `${t.region} ${t.score}`).join(' · ') || '—')}
    ${rad('Snudde i natt', flankeTekst)}
    ${rad('Abonnerer på soppvarsel', String(r.varselabonnement))}
  </table>

  <h2 style="font-size:14px;color:#1A3409;margin:22px 0 6px">Soppvarselet som trakt</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${rad('Bekreftede abonnement (per rad)', String(v.bekreftede))}
    ${rad('Nye bekreftede siste 7 dager', String(v.nyeSiste7d))}
    ${rad('Klikket varsel → områdesiden', String(v.aktiverte))}
    ${v.perKilde.slice(0, 6).map((k) => rad(`— ${kildeNavn(k.kilde)}`, `${k.bekreftede} · ${k.siste7d} siste 7 d · ${k.aktiverte} aktivert`)).join('\n    ')}
    ${v.perRegion.length ? rad('Flest abonnenter', v.perRegion.map((r) => `${r.region} ${r.bekreftede}`).join(' · ')) : ''}
  </table>

  <h2 style="font-size:14px;color:#1A3409;margin:22px 0 6px">Bruk av soppforholdene (innloggede)</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${brukRader.map(([n, v]) => rad(n, v)).join('\n    ')}
  </table>

  <h2 style="font-size:14px;color:#1A3409;margin:22px 0 6px">Hvor de registrerte kom fra</h2>
  <table style="width:100%;border-collapse:collapse;font-size:14px">
    ${kildeRader.map((k) => rad(kildeNavn(k.kilde), kildeVerdi(k))).join('\n    ') || rad('—', 'ingen registrerte')}
  </table>

  <p style="font-size:12px;color:#9ca3af;margin-top:24px;line-height:1.5">
    Besøkstall for forsiden er ikke målt — den statiske landingssiden har ingen
    JavaScript, så analyseverktøyet kjører ikke der. Kilde per registrering er
    målt fra september 2026; «direkte / ukjent» er direkte besøk pluss alle som
    registrerte seg før det. «Kom tilbake» = så soppforholdene på en senere dag
    enn registreringsdagen (forsidekortet vises automatisk samme dag, så det
    teller ikke); «to ulike uker» = ISO-uker. Bruk måles fra 6. september 2026.
    Se kommentaren i <code>api/cron/dagsrapport</code>.
  </p>
</body></html>`;

  const tekst = `Mycelet · ${dato}
${overskrift}

BRUKERE
  siste døgn ................ ${r.nyeBrukere.siste24t}
  siste 7 dager ............. ${r.nyeBrukere.siste7d}
  totalt .................... ${r.nyeBrukere.totalt}
  aldri logget inn igjen .... ${r.aldriInnloggetIgjen}

ABONNEMENT
  løpende totalt ............ ${b.totalt}
    via Stripe .............. ${b.perKilde.stripe}
    via App Store ........... ${b.perKilde.revenuecat}
    gavepass/test ........... ${b.perKilde.manuell}
  nye ekte kjøp (7 d) ....... ${b.nyeSiste7d}${r.utloptMenMarkertAktiv > 0 ? `\n  ⚠️ utløpt men merket aktiv .. ${r.utloptMenMarkertAktiv}` : ''}

I SKOGEN
  best i dag ................ ${r.toppRegioner.map((t) => `${t.region} ${t.score}`).join(', ') || '—'}
  snudde i natt ............. ${flankeTekst}
  soppvarsel-abonnenter ..... ${r.varselabonnement}

SOPPVARSELET SOM TRAKT
  bekreftede (per rad) ...... ${v.bekreftede}
  nye bekreftede (7 d) ...... ${v.nyeSiste7d}
  klikket varsel → område ... ${v.aktiverte}
${v.perKilde.slice(0, 6).map((k) => `  ${kildeNavn(k.kilde).padEnd(26, '.')} ${k.bekreftede} · ${k.siste7d} siste 7 d · ${k.aktiverte} aktivert`).join('\n')}${v.perRegion.length ? `\n  flest ..................... ${v.perRegion.map((r) => `${r.region} ${r.bekreftede}`).join(', ')}` : ''}

BRUK AV SOPPFORHOLDENE (INNLOGGEDE)
${brukRader.map(([n, v]) => `  ${n.padEnd(34, '.')} ${v}`).join('\n')}

HVOR DE REGISTRERTE KOM FRA
${kildeRader.map((k) => `  ${kildeNavn(k.kilde).padEnd(26, '.')} ${kildeVerdi(k)}`).join('\n') || '  ingen registrerte'}

Besøkstall for forsiden er ikke målt — landingssiden har ingen JavaScript.
Kilde per registrering er målt fra september 2026; «direkte / ukjent» er
direkte besøk pluss alle fra før det. «Kom tilbake» = så forholdene en senere
dag enn registreringsdagen. Bruk måles fra 6. september 2026.`;

  return { emne: `Mycelet ${dato}: ${overskrift.toLowerCase()}`, html, tekst };
}
