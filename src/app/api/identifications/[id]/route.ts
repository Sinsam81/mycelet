import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createRequestLogger } from '@/lib/log/request';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { enrichSuggestions, type BaseSuggestion } from '@/lib/identifications/enrich';
import { IDENTIFY_HISTORY_BUCKET } from '@/lib/identifications/config';
import { getUserLocale } from '@/i18n/locale';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

export const runtime = 'nodejs';

/**
 * Én rad i identifiseringshistorikken.
 *
 *   GET    — hydrerer resultatsiden fra historikken (?id= på /identify/result)
 *   PATCH  — kobler raden til funnet som nettopp ble lagret
 *   DELETE — sletter raden OG bildet
 *
 * Eierskap håndheves av RLS (migrasjon 055). `.eq('user_id', …)` i tillegg er
 * forsvar i dybden, samme mønster som /api/me/export.
 *
 * ⚠️ RUTENAVNET ER IKKE FRITT VALGT. Porttesten på resultatsiden
 * (src/app/identify/__tests__/lagre-porten.test.ts) hevder at sidens kildekode
 * ikke inneholder strengen `/api/identify` — vakta som sikrer at
 * GPS-redningen aldri brenner en ny AI-kvoteenhet. `/api/identifications`
 * inneholder ikke den strengen. Et navn som `/api/identify/history` ville
 * gjort det, og slått ut vakta som falsk positiv. Ikke døp om ruta.
 */

const ERRORS = {
  unauthenticated: { nb: 'Ikke autentisert', sv: 'Inte autentiserad' },
  not_found: { nb: 'Fant ikke identifiseringen', sv: 'Hittade inte identifieringen' },
  delete_failed: {
    nb: 'Kunne ikke slette identifiseringen. Prøv igjen.',
    sv: 'Kunde inte radera identifieringen. Försök igen.'
  },
  image_delete_failed: {
    nb: 'Kunne ikke slette bildet, så oppføringen ble beholdt. Prøv igjen.',
    sv: 'Kunde inte radera bilden, så posten behölls. Försök igen.'
  },
  link_failed: {
    nb: 'Funnet ble lagret, men historikken ble ikke oppdatert.',
    sv: 'Fyndet sparades, men historiken uppdaterades inte.'
  }
} as const satisfies Record<string, Record<Locale, string>>;

function errorResponse(code: keyof typeof ERRORS, status: number, locale: Locale) {
  return NextResponse.json({ error: ERRORS[code][locale] ?? ERRORS[code][DEFAULT_LOCALE], code }, { status });
}

/** Serverside-tekst dekkes ikke av next-intl — språket må hentes eksplisitt. */
async function readLocale(): Promise<Locale> {
  try {
    return await getUserLocale();
  } catch {
    return DEFAULT_LOCALE;
  }
}

const ROW_FIELDS =
  'id, created_at, top_suggestion_name, top_probability, suggestions, safety_data_incomplete, latitude, longitude, image_path, image_count, finding_id, saved_at';

/** Kortlevd lesetilgang til det private bildet. En time holder for én visning. */
const SIGNED_URL_SECONDS = 60 * 60;

interface HistoryRow {
  id: string;
  created_at: string;
  top_suggestion_name: string;
  top_probability: number | null;
  suggestions: BaseSuggestion[] | null;
  safety_data_incomplete: boolean;
  latitude: number | null;
  longitude: number | null;
  image_path: string | null;
  image_count: number | null;
  finding_id: string | null;
  saved_at: string | null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const locale = await readLocale();
  const { id } = await params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return errorResponse('unauthenticated', 401, locale);

  const { data, error } = await supabase
    .from('identifications')
    .select(ROW_FIELDS)
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (error || !data) {
    log.child({ userId: user.id }).info('identifications.get.not_found', { id });
    return errorResponse('not_found', 404, locale);
  }
  const row = data as unknown as HistoryRow;

  // Bildet ligger i en PRIVAT bøtte. Feiler signeringen (typisk: opplastingen
  // rakk aldri fram, så objektet finnes ikke), viser resultatsiden seg uten
  // bilde i stedet for å feile — forslagene og forvekslingsadvarselen er det
  // som betyr noe.
  let imageUrl: string | null = null;
  if (row.image_path) {
    const { data: signed } = await supabase.storage
      .from(IDENTIFY_HISTORY_BUCKET)
      .createSignedUrl(row.image_path, SIGNED_URL_SECONDS);
    imageUrl = signed?.signedUrl ?? null;
  }

  // SIKKERHETSDATAENE HENTES FERSKT — den lagrede JSON-en er aldri fasit.
  //
  // Vi kuraterer forvekslingsarter løpende (migrasjonene 048/049/050 la data
  // på 14 matsopper). En rad fra i fjor kunne ellers vist «ingen farlige
  // forvekslingsarter» for en art vi siden har ført en dødelig tvilling inn på.
  // Samme kjøring løser artsnavnene på leserens språk — frossen JSON ville
  // servert norske navn til en svensk bruker.
  //
  // Sesongvurderingen bruker måneden identifiseringen BLE GJORT, ikke dagens:
  // «i sesong nå» på en septemberidentifisering man ser på i januar er svar på
  // et spørsmål ingen stilte.
  const observedMonth = new Date(row.created_at).getMonth() + 1;
  const { suggestions, safetyDataIncomplete } = await enrichSuggestions(
    supabase,
    (row.suggestions ?? []).map((s) => ({
      name: s.name,
      commonNames: s.commonNames ?? [],
      probability: s.probability ?? 0,
      edibility: s.edibility ?? 'unknown',
      description: s.description ?? null,
      taxonomy: s.taxonomy ?? null,
      similarImages: s.similarImages ?? []
    })),
    { locale, month: observedMonth, log }
  );

  return NextResponse.json({
    identificationId: row.id,
    createdAt: row.created_at,
    originalImageDataUrl: imageUrl,
    originalImageDataUrls: imageUrl ? [imageUrl] : [],
    imageCount: row.image_count ?? 1,
    location: { latitude: row.latitude, longitude: row.longitude },
    // Rekkefølgen fra den gangen beholdes med vilje — vi rangerer IKKE på nytt.
    // Brukeren valgte en gang fra denne lista; å stokke om på den under dem
    // ville gjort en historisk visning til noe annet enn det de så.
    suggestions,
    isPlant: false,
    // Flagget settes av den ferske berikelsen, ikke av den lagrede verdien:
    // det beskriver om VI klarte oppslaget nå. Var det ufullstendig den gangen
    // også, tas det med — da manglet det noe i begge ender.
    safetyDataIncomplete: safetyDataIncomplete || row.safety_data_incomplete,
    savedFindingId: row.finding_id
  });
}

/**
 * Kobler raden til funnet den ble lagret som. Kalles rett etter at
 * /api/findings har svart OK.
 *
 * Kun `finding_id` og `saved_at` kan skrives — migrasjon 055 gir
 * `authenticated` UPDATE-rettighet på nøyaktig de to kolonnene.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const locale = await readLocale();
  const { id } = await params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return errorResponse('unauthenticated', 401, locale);

  const body = (await request.json().catch(() => null)) as { findingId?: string } | null;
  if (!body?.findingId || typeof body.findingId !== 'string') {
    return errorResponse('link_failed', 400, locale);
  }

  const { error } = await supabase
    .from('identifications')
    .update({ finding_id: body.findingId, saved_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    log.child({ userId: user.id }).warn('identifications.link_failed', { id, message: error.message });
    return errorResponse('link_failed', 500, locale);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const log = createRequestLogger(request);
  const locale = await readLocale();
  const { id } = await params;

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return errorResponse('unauthenticated', 401, locale);

  const userLog = log.child({ userId: user.id });

  // En sletteknapp er billig å trykke på. Taket hindrer at en løpsk klient
  // maler gjennom hele historikken i en løkke.
  const rateLimit = checkRateLimit(`identifications-delete:${getClientKey(request, user.id)}`, 30, 60);
  if (!rateLimit.allowed) return rateLimitResponse(rateLimit);

  const { data, error: readError } = await supabase
    .from('identifications')
    .select('id, image_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (readError || !data) return errorResponse('not_found', 404, locale);
  const row = data as { id: string; image_path: string | null };

  // REKKEFØLGEN ER IKKE VILKÅRLIG: bildet først, raden etterpå.
  //
  // Sletter vi raden først og filslettingen så feiler, blir bildet liggende i
  // Storage uten at noe peker på det — usynlig for brukeren, usynlig for
  // retensjonsjobben (som skanner rader), og fortsatt lagret hos oss etter at
  // brukeren har bedt om sletting. Det er en art. 17-feil, ikke et skjønnhetsfeil.
  // Motsatt vei er verste utfall at raden blir stående og brukeren prøver igjen.
  if (row.image_path) {
    const { error: storageError } = await supabase.storage
      .from(IDENTIFY_HISTORY_BUCKET)
      .remove([row.image_path]);
    if (storageError) {
      userLog.error('identifications.delete.image_failed', undefined, {
        id,
        message: storageError.message
      });
      return errorResponse('image_delete_failed', 500, locale);
    }
  }

  const { error: deleteError } = await supabase
    .from('identifications')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (deleteError) {
    userLog.error('identifications.delete.row_failed', undefined, { id, message: deleteError.message });
    return errorResponse('delete_failed', 500, locale);
  }

  userLog.info('identifications.deleted', { id, hadImage: row.image_path !== null });
  return NextResponse.json({ ok: true });
}
