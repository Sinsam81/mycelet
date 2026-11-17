import { NextRequest, NextResponse } from 'next/server';
import { createHash, randomUUID } from 'crypto';
import { KILDE_COOKIE, normaliserKilde } from '@/lib/analytics/kilde';
import { createAdminClient } from '@/lib/supabase/admin';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit, refundRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { PREDICTION_TILE_REGIONS } from '@/lib/prediction/tile-regions';
import { regionSlug } from '@/lib/prediction/region-slug';
import { byggBekreftelsesEpost } from '@/lib/alerts/email';
import {
  MAKS_BEKREFTELSER_PER_TIME,
  adresseMonster,
  bekreftelsesvinduFra,
  kanoniskAdresse,
  nyligBekreftelseSendt
} from '@/lib/alerts/pameldingstak';
import { sendEpost } from '@/lib/email/send';
import { vent } from '@/lib/utils/vent';

/**
 * Konto-løs påmelding til soppvarselet (migrasjon 057).
 *
 * Tar imot BÅDE vanlig skjema-POST (application/x-www-form-urlencoded) og
 * JSON. Skjemaformen er ikke nostalgi: /soppvarsel-siden er en servertegnet
 * side uten klient-JS, og den statiske landingssiden lenker dit — hele
 * påmeldingen skal virke med JavaScript avslått. Skjema-POST svarer derfor
 * med redirect tilbake til siden (303), JSON-kall får JSON.
 *
 * Skjemaet står to steder: på /soppvarsel, og i boksen på hver områdeside
 * (VarselCta). Det siste sender med `retur=<slug>`, og får da svaret tilbake
 * til områdesiden (/soppforhold/<slug>?status=…#varsel) i stedet for hit.
 *
 * Dobbel opt-in: raden skrives ubekreftet, og cron-jobben ser den ikke før
 * bekreftelseslenka i e-posten er klikket. Se migrasjonsfila for hvorfor.
 *
 * Svaret er bevisst LIKT uansett om adressen var påmeldt fra før — et skille
 * ville gjort ruta til et orakel for «er denne adressen abonnent?».
 *
 * ── TAK PER ADRESSE ─────────────────────────────────────────────────────────
 *
 * Eneste brems var et tak per IP, holdt i minnet på én instans. En ubekreftet
 * rad fikk bekreftelsen sendt på nytt ved HVERT kall, og hvert av de 22
 * områdene er en egen rad — så et skript som byttet IP (eller bare red på
 * Vercels instansvifte) kunne få oss til å sende en ubegrenset strøm av
 * e-post til noen som aldri hadde bedt om det. Mottakerne trykker
 * «søppelpost», og det rammer avsenderomdømmet de ekte varslene lever av.
 *
 * Tre lag, alle keyet på INNBOKSEN, og alle svarer nøyaktig det samme som en
 * vellykket påmelding («sendt») — aldri 429. Et eget svar ville røpet at
 * adressen nylig er brukt, og fortalt en angriper hvor taket går.
 *
 * Innboksen, ikke strengen: «ola+1», «o.la» og «ola» på Gmail (og på
 * googlemail.com) leveres alle til samme innboks. Da taket telte strengen,
 * fikk et skript som byttet IP sende tre bekreftelser i timen per skrivemåte,
 * uten grense på antall skrivemåter. Lag 1 og 3 slår skrivemåtene sammen (se
 * kanoniskAdresse og adresseMonster i pameldingstak.ts); raden lagrer og
 * e-posten går fortsatt til adressen slik den ble skrevet:
 *
 *   1. I minnet: MAKS_BEKREFTELSER_PER_TIME bekreftelser per innboks per time.
 *      Nøkkelen hashes, så adressen aldri ligger i klartekst i begrensernes
 *      Map. Laget teller e-poster som GIKK UT, ikke forsøk: plassen reserveres
 *      før databasen røres, og gis tilbake på hver utgang der ingenting ble
 *      sendt (se POST).
 *   2. På raden (overlever kaldstart og instansvifte): en ubekreftet rad får
 *      ikke ny e-post før ti minutter etter den forrige, og etter den første
 *      gjentakelsen ikke oftere enn hver time (nyligBekreftelseSendt).
 *      Tokenet roteres da heller ikke, så lenka som alt ligger i innboksen
 *      fortsatt virker — før drepte et dobbeltklikk på «Få soppvarsel» den.
 *   3. På tvers av områder og skrivemåter (også varig): er det sendt
 *      bekreftelse for MAKS_BEKREFTELSER_PER_TIME ubekreftede rader til
 *      innboksen den siste timen, sendes ingen flere — ellers ga lag 2
 *      fortsatt 22 e-poster, og hver skrivemåte sine egne.
 *
 * Lag 2 og 3 leser radens updated_at (trigger fra migrasjon 051), som for en
 * ubekreftet rad er tidspunktet for siste utsending. Ingen ny kolonne. Reglene
 * og tallene bor i src/lib/alerts/pameldingstak.ts.
 *
 * ── EN UTSENDING SOM FEILER ─────────────────────────────────────────────────
 *
 * Et nei fra sendEpost betyr ikke alltid at e-posten ikke gikk. Etter et
 * tidsavbrudd (RESEND_FRIST_MS) kan Resend ha tatt imot den uten at svaret
 * kom fram — og da slettet vi raden, svarte «noe gikk galt» og lot en død
 * lenke ligge i innboksen. Nå går det ett nytt forsøk etter et sekund, med
 * SAMME idempotensnøkkel (raden + lenka den bærer). Tok Resend imot det
 * første, får det nye forsøket svaret på det — sendt, og aldri to ganger — og
 * raden står, så lenka virker. Kom det første aldri fram, sendes den nå.
 *
 * Feiler også det nye forsøket, rulles skrivingen tilbake (ny rad slettes,
 * eksisterende rad slås av), så et nytt forsøk fra leseren ikke blir stoppet
 * av lag 2 og besvart med «sjekk innboksen» uten at noe er sendt. Av samme
 * grunn bruker den ikke opp plassen i lag 1. Bare om Resend tok imot det
 * første og så ikke svarte på noen av dem, kan en død lenke bli liggende —
 * prisen for aldri å svare «sendt» uten å vite det.
 */

/** Pausen før det ene nye forsøket på utsendingen — samme som glemt-passord. */
export const NYTT_FORSOK_ETTER_MS = 1000;

/**
 * Funksjonen må leve LENGER enn begge forsøkene på utsendingen med pausen
 * imellom (2 × RESEND_FRIST_MS i sendEpost + NYTT_FORSOK_ETTER_MS, 31 s).
 * Blir den drept mens Resend henger, kjøres aldri tilbakerullingen nederst:
 * raden står igjen ubekreftet, og neste forsøk svares «sjekk innboksen» av
 * lag 2 — uten at noe er sendt. Med 60 s rekker begge fristene å slå til,
 * raden å bli angret og leseren å få «noe gikk galt».
 */
export const maxDuration = 60;

const GYLDIGE_REGIONER = new Set(PREDICTION_TILE_REGIONS.map((r) => r.name));

/**
 * En ren adresse og ingenting annet. Mønsteret slapp gjennom «"x"<a@b.no>»,
 * «<a@b.no>», kommentarer og lister — da var strengen vi lagret og telte en
 * annen enn den e-posten ble levert til, og taket per innboks kunne lures.
 * Ellers løst med vilje: +, æøå og apostrof er ekte adresser. Begge skjemaene
 * bruker <input type="email">, som avviser de samme tegnene, så ingen ekte
 * påmelding går tapt.
 */
const EPOST_MONSTER = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[^\s@<>()[\]\\,;:".]{2,}$/;

/** RFC 5321: en adresse er høyst 254 tegn. Lengre er aldri ekte — og mønsteret i lag 3 vokser med den. */
const MAKS_ADRESSELENGDE = 254;

function erGyldigAdresse(email: string): boolean {
  return email.length <= MAKS_ADRESSELENGDE && EPOST_MONSTER.test(email);
}

/**
 * Idempotensnøkkelen til bekreftelsen: raden og lenka den bærer.
 *
 * Samme rad og samme token gir samme nøkkel, så det nye forsøket aldri kan gi
 * en e-post til. Nytt token (en ny utsending etter lag 2) gir ny nøkkel — med
 * raden alene ville Resend svart «allerede sendt» på den nye lenka i 24 timer,
 * og lenka i innboksen var den gamle, som rotasjonen nettopp drepte. Tokenet
 * står som sammendrag, ikke i klartekst: det bekrefter samtykket, og hører
 * ikke hjemme i et hode (samme regel som glemt-passord: verken adresse eller
 * token i nøkkelen).
 */
function bekreftelsesnokkel(radId: string, token: string): string {
  return `soppvarsel-bekreft/${radId}/${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}

function erSkjemaPost(request: NextRequest) {
  return (request.headers.get('content-type') ?? '').includes('application/x-www-form-urlencoded');
}

/**
 * Plassen en påmelding har tatt i taket per adresse (lag 1), fram til det er
 * avgjort om det gikk en e-post.
 */
interface Adresseplass {
  /** Gir plassen tilbake. null = ingen plass er tatt, eller e-posten gikk ut og plassen er brukt. */
  giTilbake: (() => void) | null;
}

/**
 * Lag 1 skal telle bekreftelser som faktisk GIKK UT. Før telte det forsøk:
 * hvert kall brukte en plass, også de som endte i «noe gikk galt» og ble
 * rullet tilbake. Var Resend nede, fikk leseren «noe gikk galt» tre ganger —
 * og på fjerde forsøk var taket nådd, så svaret ble «sjekk innboksen» uten at
 * det fantes verken rad eller e-post. Akkurat det tilbakerullingen skal hindre.
 *
 * Derfor RESERVERES plassen i meldPaa (før databasen røres, så to samtidige
 * kall ikke begge kan ta den siste), og den blir bare stående når e-posten
 * gikk ut. Alle andre utganger gir den tilbake her, på ett sted: feilet
 * utsending, databasefeil, «allerede påmeldt», lag 2 og 3 — og et kall som
 * kaster. En ny utgang i meldPaa kan dermed ikke glemme det.
 *
 * Hvor mange e-poster adressen kan få er uendret: lag 2 og 3 stopper fortsatt
 * det de stoppet, og tre sendte bekreftelser fyller fortsatt lag 1.
 */
export async function POST(request: NextRequest) {
  const plass: Adresseplass = { giTilbake: null };
  try {
    return await meldPaa(request, plass);
  } finally {
    plass.giTilbake?.();
  }
}

async function meldPaa(request: NextRequest, plass: Adresseplass) {
  const log = createRequestLogger(request);

  const skjema = erSkjemaPost(request);
  let email = '';
  let region = '';
  let locale = 'nb';
  let retur = '';
  if (skjema) {
    const data = await request.formData();
    email = String(data.get('email') ?? '').trim();
    region = String(data.get('region') ?? '').trim();
    locale = String(data.get('locale') ?? 'nb');
    retur = String(data.get('retur') ?? '').trim();
  } else {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    email = String(body.email ?? '').trim();
    region = String(body.region ?? '').trim();
    locale = String(body.locale ?? 'nb');
  }
  if (locale !== 'sv') locale = 'nb';

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? request.nextUrl.origin;
  // Svaret går tilbake til områdesiden BARE når `retur` er nøyaktig slugen til
  // området som meldes på — utledet her, av et regionnavn fra vår egen liste.
  // Fri tekst fra skjemaet havner aldri i en redirect.
  const returSlug = retur !== '' && GYLDIGE_REGIONER.has(region) && retur === regionSlug(region) ? retur : null;
  const tilbake = (status: string) =>
    skjema
      ? NextResponse.redirect(
          returSlug
            ? `${appUrl}/soppforhold/${returSlug}?status=${status}#varsel`
            : `${appUrl}/soppvarsel?status=${status}#status`,
          303
        )
      : NextResponse.json({ ok: status === 'sendt' , status});

  const gyldigEpost = erGyldigAdresse(email);
  if (!gyldigEpost || !GYLDIGE_REGIONER.has(region)) {
    log.info('varselpamelding.avvist', { region, gyldigEpost });
    return tilbake('ugyldig');
  }

  // 5 påmeldinger per time per klient: stopper både skript og fingerfeil.
  // Skjemaet får sin egen status: «Noe manglet — sjekk at e-postadressen er
  // riktig» var feil årsak, og sendte folk på leting etter en skrivefeil.
  // (Dette taket er per KLIENT og røper ingenting om adressen — i motsetning
  // til taket per adresse under, som derfor svarer «sendt».)
  const rl = checkRateLimit(`varselpamelding:${getClientKey(request, null)}`, 5, 3600);
  if (!rl.allowed) return skjema ? tilbake('for-mange') : rateLimitResponse(rl);

  // Lag 1 av taket per adresse — FØR noe databaseoppslag. Samme nøytrale svar
  // som en påmelding som gikk gjennom; se «TAK PER ADRESSE» i filhodet.
  // Nøkkelen er innboksen, så +merkelapper og Gmail-punktum deler plass.
  const adresse = email.toLowerCase();
  const adresseHash = createHash('sha256').update(kanoniskAdresse(adresse)).digest('hex');
  const adresseNokkel = `varselpamelding-epost:${adresseHash}`;
  const tatt = checkRateLimit(adresseNokkel, MAKS_BEKREFTELSER_PER_TIME, 3600);
  if (!tatt.allowed) {
    log.info('varselpamelding.adressetak', { region, lag: 'minne' });
    return tilbake('sendt');
  }
  // Reservert, ikke brukt: POST gir plassen tilbake med mindre e-posten går ut.
  plass.giTilbake = () => refundRateLimit(adresseNokkel, tatt);

  const db = createAdminClient();

  // Hvor kom påmeldingen fra? Samme cookie som kontoregistreringen leser —
  // uten dette telte partnerlenker og presse som «ukjent», og plasseringene
  // kunne ikke vurderes. Normalisert: kort tekst, aldri noe annet.
  const kilde = normaliserKilde(request.cookies.get(KILDE_COOKIE)?.value);

  // Finnes raden fra før? Bekreftet → stille suksess (ingen ny e-post, ingen
  // lekkasje). Ubekreftet → send bekreftelsen på nytt (folk mister e-poster),
  // men ikke oftere enn lag 2 tillater.
  //
  // ⚠️ eq, ikke ilike. Oppslaget brukte ilike med brukerinput, og
  // e-postmønsteret over slipper gjennom «%» og «_» — strengen «%@%.%%»
  // matchet da HVILKEN SOM HELST rad i regionen. Traff den én avmeldt rad,
  // ble offerets abonnement reaktivert (uten at offeret fikk noen e-post,
  // for bekreftelsen gikk til jokertegnstrengen), og svaret røpet om det
  // fantes nøyaktig én aktiv abonnent som matchet. Innsettingen lagrer alltid
  // lowercase, og den unike indeksen er på lower(email), så eq på lowercase
  // er både riktig og billigere.
  const { data: eksisterende } = await db
    .from('alert_subscriptions')
    .select('id,confirmed_at,active,kilde,created_at,updated_at')
    .is('user_id', null)
    .eq('email', adresse)
    .eq('region', region)
    .maybeSingle();

  if (eksisterende?.confirmed_at && eksisterende.active) return tilbake('sendt');

  const naaMs = Date.now();

  // Lag 2: raden venter alt på bekreftelse, og e-posten gikk nylig. Ingenting
  // skrives — tokenet står, så lenka i innboksen virker fortsatt. Gjelder BARE
  // aktiv + ubekreftet: en avmeldt rad har fersk updated_at fra selve
  // avmeldingen, og skal kunne melde seg på igjen med én gang.
  if (eksisterende && nyligBekreftelseSendt(eksisterende, naaMs)) {
    log.info('varselpamelding.adressetak', { region, lag: 'rad' });
    return tilbake('sendt');
  }

  // Lag 3: hvor mange ubekreftede rader til denne innboksen har fått
  // bekreftelse den siste timen — på tvers av områder og skrivemåter? Telles i
  // databasen, så taket holder over kaldstarter og instanser.
  //
  // ⚠️ Et forankret, escapet regulært uttrykk (adresseMonster), ikke ilike.
  // «ola%» på et domene ville også telt «olav» der — og da kunne hvem som
  // helst fylt taket til en annen adresse og fått bekreftelsene dens svelget
  // bak «sendt». Mønsteret treffer nøyaktig de lagrede adressene med samme
  // innboks (se pameldingstak.ts og testene der).
  const { count: ventende, error: tellErr } = await db
    .from('alert_subscriptions')
    .select('id', { count: 'exact', head: true })
    .is('user_id', null)
    .regexIMatch('email', adresseMonster(adresse))
    .eq('active', true)
    .is('confirmed_at', null)
    .gte('updated_at', bekreftelsesvinduFra(naaMs));
  if (tellErr) {
    // Uten tellingen vet vi ikke om taket er nådd. Da sendes ingenting.
    log.error('varselpamelding.telling_feilet', undefined, { message: tellErr.message });
    return tilbake('feil');
  }
  if ((ventende ?? 0) >= MAKS_BEKREFTELSER_PER_TIME) {
    log.info('varselpamelding.adressetak', { region, lag: 'omrader' });
    return tilbake('sendt');
  }

  let confirmToken: string;
  /** Raden lenka hører til — en del av idempotensnøkkelen. */
  let radId: string;
  /** Angrer skrivingen under når e-posten ikke kom ut — se filhodet. */
  let rullTilbake: () => PromiseLike<{ error: { message: string } | null }>;
  if (eksisterende) {
    // Avmeldt eller ubekreftet: reaktivering er et NYTT samtykke, fullt ut.
    //
    // Raden beholdt gammel confirmed_at her før. Cron-filteret ser bare på
    // (!user_id && !confirmed_at), så i det øyeblikket active ble true var en
    // avmeldt adresse «bekreftet» igjen — og fikk varsel uten å ha klikket
    // noe som helst. Hvem som helst kunne utløse det ved å sende inn
    // adressen. Bekreftelsen nullstilles og tokenet roteres, så raden er
    // usynlig for utsendingen til den NYESTE lenka er klikket; gamle lenker i
    // innboksen (eller e-postskannere som følger dem) reaktiverer ingenting.
    confirmToken = randomUUID();
    const { error: reaktiverErr } = await db
      .from('alert_subscriptions')
      // Første kilde vinner — som for cookien.
      .update({ active: true, confirmed_at: null, confirm_token: confirmToken, locale, ...(eksisterende.kilde ? {} : { kilde }) })
      .eq('id', eksisterende.id);
    if (reaktiverErr) {
      log.error('varselpamelding.reaktivering_feilet', undefined, { message: reaktiverErr.message });
      return tilbake('feil');
    }
    radId = String(eksisterende.id);
    // Slås av igjen, ikke slettes: raden fantes fra før. Avslått er den utenfor
    // lag 2 og 3, så neste forsøk går rett gjennom.
    rullTilbake = () =>
      db.from('alert_subscriptions').update({ active: false }).eq('id', eksisterende.id).is('confirmed_at', null);
  } else {
    const { data: ny, error } = await db
      .from('alert_subscriptions')
      .insert({ user_id: null, email: adresse, region, locale, active: true, confirmed_at: null, kilde })
      .select('id,confirm_token')
      .single();
    if (error || !ny) {
      log.error('varselpamelding.insert_feilet', undefined, { message: error?.message });
      return tilbake('feil');
    }
    confirmToken = ny.confirm_token as string;
    radId = String(ny.id);
    // Raden ble til nå, og ingen e-post bærer lenka dens: da skal den bort.
    // Bare så lenge den er ubekreftet — vi sletter aldri et gitt samtykke.
    rullTilbake = () =>
      db.from('alert_subscriptions').delete().eq('id', ny.id).is('user_id', null).is('confirmed_at', null);
  }

  const { emne, html, tekst } = byggBekreftelsesEpost({
    region,
    locale: locale as 'nb' | 'sv',
    // &sprak= er for siden bekreft-ruta tegner selv når lenka hentes av noe
    // annet enn en navigering (ett trykk til) — den skal ha e-postens språk.
    bekreftUrl: `${appUrl}/api/soppvarsel/bekreft?t=${confirmToken}&sprak=${locale}`
  });
  const melding = {
    // Til adressen slik den ble skrevet og lagret — ikke den kanoniske formen,
    // som bare er en nøkkel for taket. Varslene går senere til den samme.
    til: adresse,
    emne,
    html,
    tekst,
    idempotensNokkel: bekreftelsesnokkel(radId, confirmToken)
  };
  // Ett nytt forsøk med samme nøkkel og samme innhold: et tidsavbrudd kan ha
  // sendt e-posten, og da gir Resend oss svaret på den i stedet for en til.
  let res = await sendEpost(melding);
  if (!res.ok) {
    log.warn('varselpamelding.epost_feilet', { detalj: res.detalj, forsok: 1 });
    await vent(NYTT_FORSOK_ETTER_MS);
    res = await sendEpost(melding);
  }
  if (!res.ok) {
    log.error('varselpamelding.epost_feilet', undefined, { detalj: res.detalj, forsok: 2 });
    const { error: angreErr } = await rullTilbake();
    // Står raden igjen, svarer lag 2 «sendt» på neste forsøk uten å sende.
    if (angreErr) log.error('varselpamelding.tilbakerulling_feilet', undefined, { message: angreErr.message });
    return tilbake('feil');
  }

  // E-posten gikk ut: nå er plassen i lag 1 brukt, og skal ikke gis tilbake.
  plass.giTilbake = null;
  log.info('varselpamelding.bekreftelse_sendt', { region, locale });
  return tilbake('sendt');
}
