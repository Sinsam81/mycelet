import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkRateLimit } from '@/lib/rate-limit';
import { getClientKey, rateLimitResponse } from '@/lib/rate-limit/route';
import { createRequestLogger } from '@/lib/log/request';
import { LEGAL_ENTITY } from '@/lib/legal/entity';
import { IDENTIFY_HISTORY_BUCKET } from '@/lib/identifications/config';

/**
 * GDPR Article 15 — right of access.
 *
 * Returns a JSON file containing every row tied to the authenticated user
 * across our database. Uses the session client so RLS is the source of truth
 * for what the user can read. If RLS is missing for some table, that table
 * returns empty here — the fix belongs in the policy, not in this endpoint.
 *
 * ONE EXCEPTION: `ai_identifications` has RLS enabled with no policies at all
 * (service-role only, so nobody can reset their own AI quota). Through the
 * session client it would always come back empty — an empty list that reads
 * like an answer. That one table is read with the admin client, filtered
 * explicitly on the caller's user_id.
 *
 * FAIL CLOSED. Every query is checked, and a single failure aborts the whole
 * export with a 500. Earlier this endpoint did `findings.data ?? []` on each
 * result, so a query that errored became an empty array inside a file the user
 * received as a complete answer to their Article 15 request — silently telling
 * them we hold no findings when we might hold hundreds. A missing export the
 * user can retry is a far smaller problem than a wrong one they trust.
 *
 * Note the distinction: an RLS policy that legitimately returns zero rows is
 * NOT an error, and still exports as []. Only a failed query aborts.
 *
 * Out of scope (intentionally not in the export):
 *   - Public reference data (mushroom species, look-alikes, prediction tiles)
 *   - Forum posts / comments by other users (not personal data about caller)
 *   - Reports filed BY OTHERS about the caller (would expose reporter)
 *   - admin_audit_log rows mentioning the caller (they identify the acting
 *     administrator too — manual review required)
 *
 * For "data about you from other users" requests, the user should contact
 * the privacy mailbox; that requires manual review.
 */
/** Den delen av et Supabase-svar denne ruten faktisk bryr seg om. */
type QueryResult = { data: unknown; error: { message: string } | null };

export async function GET(request: NextRequest) {
  const log = createRequestLogger(request);
  log.info('account.export.start');

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    log.info('account.export.unauthenticated');
    return NextResponse.json({ error: 'Ikke autentisert' }, { status: 401 });
  }

  const userLog = log.child({ userId: user.id });

  // The export runs one query per user table — defending against a
  // refresh-loop hammering the DB. 10/min is plenty for any honest UI
  // pattern (downloading once, maybe again to verify).
  const rateLimit = checkRateLimit(`me-export:${getClientKey(request, user.id)}`, 10, 60);
  if (!rateLimit.allowed) {
    userLog.warn('account.export.rate_limited');
    return rateLimitResponse(rateLimit);
  }

  // `ai_identifications` har RLS på uten en eneste policy — kun tjenesterollen
  // kan lese den (migrasjon 020, så ingen kan nullstille sin egen AI-kvote).
  // Øktklienten ville derfor alltid gitt [], altså en tom liste som ser ut som
  // et svar. Vi leser den med tjenestenøkkelen og filtrerer eksplisitt på
  // brukerens egen id.
  //
  // Mangler nøkkelen, kan vi ikke kalle eksporten fullstendig — samme
  // fail-closed-regel som for en spørring som feiler.
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    userLog.error('account.export.no_service_role_key');
    return NextResponse.json(
      {
        error: 'Kunne ikke hente ut alle dataene dine',
        details:
          'Eksporten ble avbrutt på grunn av en serverfeil. Du har IKKE fått en ufullstendig fil. Prøv igjen om litt — vedvarer feilen, kontakt ' +
          LEGAL_ENTITY.privacyEmail +
          '.'
      },
      { status: 500 }
    );
  }

  // All queries scoped to the authenticated user_id. RLS would also enforce
  // this — the explicit .eq() is defense in depth.
  //
  // Keyed rather than positional: the manifest below reports coverage per
  // dataset, and a positional array made it too easy to add a query without
  // adding it to the completeness check.
  // `shape` says what an empty result means for this dataset: a table the user
  // has many rows in exports as [], a one-per-user row exports as null.
  // PostgREST kapper stille på 1000 rader. Uten paginering fikk en bruker
  // med 1 001 funn en fil merket «komplett» som manglet det siste — og
  // fail-closed-sjekken under så ingen feil, for avkorting ER ikke en feil.
  // Hvert flerrads-datasett hentes derfor i sider, sortert på en stabil nøkkel.
  const SIDE = 1000;
  const hentAlle = async (
    bygg: (fra: number, til: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
  ): Promise<QueryResult> => {
    const alle: unknown[] = [];
    for (let side = 0; side < 100; side += 1) {
      const fra = side * SIDE;
      const { data, error } = await bygg(fra, fra + SIDE - 1);
      if (error) return { data: null, error };
      const rader = Array.isArray(data) ? data : [];
      alle.push(...rader);
      if (rader.length < SIDE) return { data: alle, error: null };
    }
    return { data: null, error: { message: 'over 100 000 rader i ett datasett — eksporten må hentes manuelt' } };
  };
  const mange = (tabell: string, kolonne: string, verdi: string, sorter: string, klient = supabase) =>
    hentAlle((fra, til) => klient.from(tabell).select('*').eq(kolonne, verdi).order(sorter).range(fra, til));

  const epost = user.email?.toLowerCase() ?? null;

  const datasets = {
    profile: { shape: 'one', query: supabase.from('profiles').select('*').eq('id', user.id).maybeSingle() },
    // Uten deleted_at-filter, med vilje: art. 15 gjelder det vi FAKTISK
    // lagrer om deg. Et funn du har slettet ligger hos oss i inntil 30 dager
    // til (migrasjon 056 + /api/cron/purge-deleted-findings), og da skal det
    // stå i uttrekket — med `deleted_at` synlig, så du ser at det er slettet.
    findings: { shape: 'many', query: mange('findings', 'user_id', user.id, 'id') },
    forumPosts: { shape: 'many', query: mange('forum_posts', 'user_id', user.id, 'id') },
    comments: { shape: 'many', query: mange('comments', 'user_id', user.id, 'id') },
    postLikes: { shape: 'many', query: mange('post_likes', 'user_id', user.id, 'post_id') },
    commentLikes: { shape: 'many', query: mange('comment_likes', 'user_id', user.id, 'comment_id') },
    savedPosts: { shape: 'many', query: mange('saved_posts', 'user_id', user.id, 'post_id') },
    reportsFiled: { shape: 'many', query: mange('reports', 'reporter_id', user.id, 'id') },
    billing: { shape: 'one', query: supabase.from('billing_subscriptions').select('*').eq('user_id', user.id).maybeSingle() },
    moderatorRole: { shape: 'one', query: supabase.from('moderator_roles').select('*').eq('user_id', user.id).maybeSingle() },
    verifiedForager: { shape: 'one', query: supabase.from('verified_foragers').select('*').eq('user_id', user.id).maybeSingle() },
    // Tilbakemeldingene på «Var du her? Fant du sopp?». Dette er det datasettet
    // med de mest presise koordinatene vi lagrer om en bruker: latitude og
    // longitude med fem desimaler (~1 m), utenfor visibility-modellen og
    // display_location-triggeren som beskytter funn. At nettopp det manglet i
    // en eksport som erklærte seg fullstendig, var det verste hullet.
    spotFeedback: { shape: 'many', query: mange('spot_feedback', 'user_id', user.id, 'id') },
    // Varselet om automatisk sletting etter tre år uten innlogging.
    deletionWarning: {
      shape: 'one',
      query: supabase.from('account_deletion_warnings').select('*').eq('user_id', user.id).maybeSingle()
    },
    // Tidspunktene for AI-identifiseringene dine (grunnlaget for dagskvoten).
    // Leses med tjenesterollen — se kommentaren over.
    aiIdentifications: { shape: 'many', query: mange('ai_identifications', 'user_id', user.id, 'id', admin) },
    // Identifiseringshistorikken (migrasjon 055). I motsetning til
    // ai_identifications har DENNE eier-RLS, så den leses med øktklienten som
    // alt annet — det er tabellen brukeren selv ser på /identifiseringer.
    identifications: { shape: 'many', query: mange('identifications', 'user_id', user.id, 'id') },
    // Soppvarsel-abonnementene: kontorader (user_id) OG kontoløse rader meldt
    // på med samme e-post via /soppvarsel — de har user_id null og finnes
    // bare via adressen, derfor tjenesterollen. Tokenene (bekreftelse,
    // avmelding) er nøkler, ikke opplysninger om brukeren, og utelates.
    alertSubscriptions: {
      shape: 'many',
      query: hentAlle((fra, til) =>
        admin
          .from('alert_subscriptions')
          .select('id,user_id,email,region,locale,active,confirmed_at,last_notified_at,last_notified_score,created_at,kilde,forste_apnet_at,sist_apnet_at')
          .or(epost ? `user_id.eq.${user.id},email.eq."${epost}"` : `user_id.eq.${user.id}`)
          .order('id')
          .range(fra, til)
      )
    },
    // Hvem brukeren selv har blokkert (migrasjon 032). Blokkeringer AV
    // brukeren, gjort av andre, holdes utenfor — de er den andres valg.
    blockedUsers: { shape: 'many', query: mange('blocked_users', 'blocker_id', user.id, 'blocked_id') },
    // Bruksdager (migrasjon 064): dag + flate der soppforholdene ble vist. Egne rader via RLS.
    usageDays: { shape: 'many', query: mange('bruksdager', 'user_id', user.id, 'dag') }
  };

  type DatasetKey = keyof typeof datasets;
  const keys = Object.keys(datasets) as DatasetKey[];
  const settled = await Promise.all(keys.map((k) => datasets[k].query));

  // Normaliser til én form. Supabase returnerer en union (suksess | feil) der
  // hver gren har sin egen datatype; vi bryr oss bare om «gikk det, og hva kom».
  const results = Object.fromEntries(
    keys.map((k, i) => [k, { data: settled[i].data as unknown, error: settled[i].error }])
  ) as Record<DatasetKey, QueryResult>;

  // Fail closed: any failed query means we cannot honestly call this export
  // complete, so we send nothing rather than something misleading.
  const failed = keys.filter((k) => results[k].error);
  if (failed.length > 0) {
    userLog.error('account.export.incomplete', undefined, {
      failedDatasets: failed,
      // Provider messages can carry schema details — keep them in the log,
      // never in the response body.
      firstError: results[failed[0]].error?.message
    });
    return NextResponse.json(
      {
        error: 'Kunne ikke hente ut alle dataene dine',
        details:
          'Eksporten ble avbrutt fordi minst ett datasett ikke kunne leses. Du har IKKE fått en ufullstendig fil. Prøv igjen om litt — vedvarer feilen, kontakt ' +
          LEGAL_ENTITY.privacyEmail +
          '.'
      },
      { status: 500 }
    );
  }

  // Bildene i identifiseringshistorikken ligger i en PRIVAT bøtte. En bar
  // filsti er ikke et svar på et art. 15-krav — funnbildene er nåbare i dag
  // bare fordi finding-images er offentlig. Hver rad får derfor en signert
  // URL ved siden av stien.
  //
  // Signeringen feiler IKKE lukket, i motsetning til spørringene over, og det
  // er et bevisst skille: metadataene i fila er komplette uansett, og et
  // manglende bildevedlegg er noe annet enn et datasett som stille ble tomt.
  // Feiler den, står stien der og _notes sier hva man gjør. Å nekte hele
  // eksporten fordi ÉN signering røk ville gitt brukeren ingenting i stedet
  // for nesten alt.
  let imageLinksComplete = true;
  const identificationRows = (results.identifications.data ?? []) as Array<Record<string, unknown>>;
  const identificationPaths = identificationRows
    .map((row) => row.image_path)
    .filter((p): p is string => typeof p === 'string' && p.length > 0);
  if (identificationPaths.length > 0) {
    const { data: signed, error: signError } = await admin.storage
      .from(IDENTIFY_HISTORY_BUCKET)
      // Sju dager: lenge nok til at et nedlastet arkiv fortsatt virker når
      // brukeren rekker å åpne det, kort nok til at en lekket fil ikke er en
      // permanent nøkkel inn i bildene.
      .createSignedUrls(identificationPaths, 60 * 60 * 24 * 7);
    if (signError || !signed) {
      imageLinksComplete = false;
      userLog.warn('account.export.image_links_failed', { message: signError?.message });
    } else {
      const byPath = new Map(signed.map((entry) => [entry.path ?? '', entry.signedUrl ?? null]));
      for (const row of identificationRows) {
        const path = typeof row.image_path === 'string' ? row.image_path : null;
        row.imageSignedUrl = path ? (byPath.get(path) ?? null) : null;
        if (path && !row.imageSignedUrl) imageLinksComplete = false;
      }
    }
  }

  const rowCount = (value: unknown) => (Array.isArray(value) ? value.length : value == null ? 0 : 1);
  const generatedAt = new Date().toISOString();

  const exportData = {
    exportedAt: generatedAt,
    // 3: la til spotFeedback, deletionWarning og aiIdentifications.
    // 4: la til identifications (AI-historikken) med signerte bilde-URL-er.
    // 5: la til alertSubscriptions (også kontoløse på e-post), blockedUsers,
    //    account.metadata (kilde, vilkårssamtykke, brukernavn) og
    //    account.identities; flerrads-datasett pagineres nå.
    // 6: la til usageDays (bruksdager — dag og flate der soppforholdene ble vist).
    schemaVersion: 6,
    account: {
      userId: user.id,
      email: user.email ?? null,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
      // user_metadata bærer registreringskilden (kilde), vilkårssamtykket
      // (terms_version/terms_accepted_at — et tidsstemplet samtykkebevis)
      // og brukernavn. Persondata etter art. 15, og de lå utenfor før.
      metadata: user.user_metadata ?? {},
      identities: (user.identities ?? []).map((i) => i.provider)
    },
    ...(Object.fromEntries(
      keys.map((k) => [k, results[k].data ?? (datasets[k].shape === 'many' ? [] : null)])
    ) as Record<DatasetKey, unknown>),
    _manifest: {
      generatedAt,
      // Lets the recipient verify nothing was quietly dropped in transit, and
      // gives support something concrete to compare against a re-run.
      datasets: Object.fromEntries(keys.map((k) => [k, rowCount(results[k].data)])),
      complete: true,
      // Egen flagg for bildelenkene, fordi de er det ene i denne fila som kan
      // være ufullstendig uten at eksporten avbrytes. Står den false, mangler
      // det vedlegg — og da skal det være mulig å se det, ikke gjettes.
      imageLinksComplete
    },
    _notes: {
      gdprArticle: 'GDPR Art. 15 — Right of access.',
      coverage:
        'This export contains all rows in our database tied to your user_id, plus mushroom-alert subscriptions registered with your e-mail address without an account. Public reference data (species, look-alikes, prediction tiles) is intentionally not included since it is not personal data about you. Confirmation and unsubscribe tokens for alert subscriptions are omitted: they are keys, not information about you.',
      completeness:
        'Every query behind this file succeeded. If any had failed you would have received an error instead of this file — we never ship a partial export as if it were complete.',
      images: `Bilder i identifiseringshistorikken din ligger i et lukket lager. Hver rad under "identifications" har derfor et felt "imageSignedUrl" med en midlertidig nedlastingslenke som er gyldig i 7 dager fra tidspunktet øverst i fila. Er lenken utløpt eller tom, be om en ny eksport, eller kontakt ${LEGAL_ENTITY.privacyEmail}. Bilder knyttet til lagrede funn ligger på de vanlige URL-ene i "findings".`,
      dataAboutYouFromOthers: `Reports filed BY OTHER USERS about your content are not in this export to protect the reporter. Entries in our admin audit log that mention you (for example an administrator granting you verified-forager status) are also left out, because those rows identify the administrator as well. To request either, contact ${LEGAL_ENTITY.privacyEmail} — manual review required.`
    }
  };

  const filename = `mycelet-data-export-${user.id}-${generatedAt.slice(0, 10)}.json`;

  userLog.info('account.export.success', {
    counts: exportData._manifest.datasets
  });

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  });
}
