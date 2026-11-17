/**
 * Ren logikk bak moderasjonskonsollen: hva en moderator får se av en rapport,
 * og hvor gammel den eldste åpne rapporten er.
 *
 * Ruten (src/app/api/admin/moderation/route.ts) henter radene med
 * tjenesterollen — nødvendig, fordi skjult innhold og innhold fra noen
 * moderatoren selv har blokkert er usynlig gjennom RLS — og denne fila avgjør
 * hva som slipper ut til nettleseren. Tre ting slipper aldri ut:
 *
 *  - hvem som meldte (`reporter_id`): moderatoren skal vurdere innholdet, ikke
 *    melderen, og en lekket melder er grunnen til at folk slutter å melde;
 *  - koordinater for et funn, rå eller maskerte — art og dato holder for å
 *    kjenne igjen funnet, og id-en finner raden i databasen;
 *  - notat og bilde som ingen leser får se. De følger viewet `public_findings`
 *    (migrasjon 023 og 056): notatet bare for et helt offentlig funn som ikke
 *    er et sonefunn, bildet for offentlige og omtrentlige funn. Fra et privat
 *    funn slipper verken notat, bilde eller artsnavnet eieren selv har skrevet
 *    ut. Rapporttabellen sjekker ikke at melderen kunne se funnet, så en id
 *    fra et koblet foruminnlegg skal ikke bli en vei inn til noens notater om
 *    hvor soppen står.
 */

/**
 * `resolve` er sluttstatusen «behandlet» uten at noe skjules herfra: innholdet
 * er rettet, fjernet av eieren, eller — for funn, som ikke kan skjules fra
 * konsollen — tatt hånd om for hånd. Uten den kunne en funnrapport bare bli
 * «avvist», også når den førte til at noe ble gjort.
 */
export type ModerationAction = 'hide' | 'unhide' | 'dismiss' | 'reviewed' | 'resolve';

export const MODERATION_ACTIONS: readonly ModerationAction[] = ['hide', 'unhide', 'dismiss', 'reviewed', 'resolve'];

export function erModerationAction(value: unknown): value is ModerationAction {
  return typeof value === 'string' && (MODERATION_ACTIONS as readonly string[]).includes(value);
}

export type ReportStatus = 'pending' | 'reviewed' | 'resolved' | 'dismissed';

/**
 * Rapportene som fortsatt venter på en avgjørelse. «Gjennomgått» betyr sett,
 * ikke avsluttet (`resolved_at` er fortsatt NULL), så den teller som åpen
 * overalt: i lista «Åpne», i tellingen bak døgnfristen, og i det en skjuling
 * løser. Lista og tellingen filtrerte før bare på `pending`, og da forsvant en
 * gjennomgått rapport fra begge uten å være ferdig.
 */
export const AAPNE_RAPPORTSTATUSER: readonly ReportStatus[] = ['pending', 'reviewed'];

export function erAapenRapport(status: string | null | undefined): boolean {
  return (AAPNE_RAPPORTSTATUSER as readonly string[]).includes(status ?? '');
}

export interface ModerationReportRow {
  id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  created_at: string;
  post_id: string | null;
  comment_id: string | null;
  finding_id: string | null;
  /** Kan følge med fra databasen; skal aldri videre. */
  reporter_id?: string | null;
}

export interface ModerationPostRow {
  id: string;
  user_id: string | null;
  title: string | null;
  content: string | null;
  images: unknown;
  is_hidden: boolean | null;
}

export interface ModerationCommentRow {
  id: string;
  user_id: string | null;
  post_id: string | null;
  content: string | null;
  is_hidden: boolean | null;
}

interface SpeciesNames {
  norwegian_name?: string | null;
  swedish_name?: string | null;
}

export interface ModerationFindingRow {
  id: string;
  user_id: string | null;
  species_name_override: string | null;
  found_at: string | null;
  visibility: string | null;
  /** Mangler flagget, regnes funnet aldri som helt offentlig — notatet holdes tilbake. */
  is_zone_finding?: boolean | null;
  zone_label?: string | null;
  notes: string | null;
  thumbnail_url: string | null;
  deleted_at?: string | null;
  mushroom_species?: SpeciesNames | SpeciesNames[] | null;
}

export interface ModerationProfileRow {
  id: string;
  username: string | null;
}

/**
 * Hvordan et funn vises for andre — det moderatoren trenger for å vurdere en
 * melding om personvern eller fredede arter, uten at koordinatene sendes ut.
 *  - `public`: nøyaktig posisjon og notat er synlig for alle;
 *  - `approximate`: forskjøvet posisjon, notatet er skjult;
 *  - `zone`: bare sonen vises (posisjonen er festet til et rutenett);
 *  - `private`: ingen andre enn eieren ser funnet.
 */
export type FunnVisning = 'public' | 'approximate' | 'zone' | 'private';

export interface ModerationTarget {
  type: 'post' | 'comment' | 'finding';
  id: string;
  /** Innholdet er slettet siden det ble meldt. */
  missing: boolean;
  /** Tråden innholdet hører til, og om den fortsatt kan åpnes. */
  postId: string | null;
  threadVisible: boolean;
  title: string | null;
  excerpt: string | null;
  images: string[];
  isHidden: boolean;
  /** Funn har ingen `is_hidden` ennå, så de kan ikke skjules herfra. */
  canHide: boolean;
  authorUsername: string | null;
  species: { norwegian_name: string | null; swedish_name: string | null } | null;
  speciesOverride: string | null;
  foundAt: string | null;
  /** Bare for funn; null for innlegg og kommentarer. */
  shownAs: FunnVisning | null;
  /** Sonenavnet på et sonefunn — det samme alle lesere ser. */
  zoneLabel: string | null;
}

export interface ModerationReportItem {
  id: string;
  reason: string;
  description: string | null;
  status: ReportStatus;
  createdAt: string;
  target: ModerationTarget;
}

/** Lang nok til å vurdere innholdet, kort nok til at ett innlegg ikke fyller siden. */
export const UTDRAG_MAKS = 1200;

export function utdrag(text: string | null | undefined, maks = UTDRAG_MAKS): string | null {
  const trimmed = (text ?? '').trim();
  if (!trimmed) return null;
  if (trimmed.length <= maks) return trimmed;
  return `${trimmed.slice(0, maks).trimEnd()}…`;
}

/** Bildeadressene i et innleggs `images`-felt (jsonb — kan være hva som helst). */
export function bildeUrler(images: unknown): string[] {
  if (!Array.isArray(images)) return [];
  const urls: string[] = [];
  for (const image of images) {
    const url =
      typeof image === 'string'
        ? image
        : image && typeof image === 'object'
          ? ((image as { thumbnail_url?: unknown; url?: unknown }).thumbnail_url ?? (image as { url?: unknown }).url)
          : null;
    // Bare http(s): adressen havner i en <img src>, og feltet er brukerstyrt.
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) urls.push(url);
  }
  return urls;
}

function tomtMaal(type: ModerationTarget['type'], id: string): ModerationTarget {
  return {
    type,
    id,
    missing: true,
    postId: null,
    threadVisible: false,
    title: null,
    excerpt: null,
    images: [],
    isHidden: false,
    canHide: false,
    authorUsername: null,
    species: null,
    speciesOverride: null,
    foundAt: null,
    shownAs: null,
    zoneLabel: null
  };
}

/**
 * Samme grener som `public_findings`: privat (eller ukjent) vises ikke, et
 * sonefunn vises som sone, og bare `public` med `is_zone_finding = false` vises
 * med nøyaktig posisjon. Et flagg som mangler gir aldri «helt offentlig» —
 * som i SQL, der NULL ikke er lik false.
 */
export function funnVisning(finding: Pick<ModerationFindingRow, 'visibility' | 'is_zone_finding'>): FunnVisning {
  if (finding.visibility !== 'public' && finding.visibility !== 'approximate') return 'private';
  if (finding.is_zone_finding === true) return 'zone';
  if (finding.visibility === 'public' && finding.is_zone_finding === false) return 'public';
  return 'approximate';
}

export interface RapportvisningInn {
  reports: ModerationReportRow[];
  posts: ModerationPostRow[];
  comments: ModerationCommentRow[];
  findings: ModerationFindingRow[];
  profiles: ModerationProfileRow[];
}

/**
 * Setter sammen rapportene med det meldte innholdet. Bygger hvert objekt felt
 * for felt i stedet for å spre databaseraden, slik at en ny kolonne i en
 * spørring ikke lekker ut av seg selv.
 */
export function byggRapportvisning(inn: RapportvisningInn): ModerationReportItem[] {
  const posts = new Map(inn.posts.map((p) => [p.id, p]));
  const comments = new Map(inn.comments.map((c) => [c.id, c]));
  const findings = new Map(inn.findings.map((f) => [f.id, f]));
  const usernames = new Map(inn.profiles.map((p) => [p.id, p.username]));
  const forfatter = (userId: string | null | undefined) => (userId ? usernames.get(userId) ?? null : null);

  const maalFor = (report: ModerationReportRow): ModerationTarget => {
    if (report.post_id) {
      const post = posts.get(report.post_id);
      if (!post) return tomtMaal('post', report.post_id);
      const isHidden = post.is_hidden === true;
      return {
        ...tomtMaal('post', post.id),
        missing: false,
        postId: post.id,
        threadVisible: !isHidden,
        title: post.title,
        excerpt: utdrag(post.content),
        images: bildeUrler(post.images),
        isHidden,
        canHide: true,
        authorUsername: forfatter(post.user_id)
      };
    }

    if (report.comment_id) {
      const comment = comments.get(report.comment_id);
      if (!comment) return tomtMaal('comment', report.comment_id);
      const post = comment.post_id ? posts.get(comment.post_id) : undefined;
      return {
        ...tomtMaal('comment', comment.id),
        missing: false,
        postId: comment.post_id,
        threadVisible: Boolean(post) && post?.is_hidden !== true,
        title: post?.title ?? null,
        excerpt: utdrag(comment.content),
        isHidden: comment.is_hidden === true,
        canHide: true,
        authorUsername: forfatter(comment.user_id)
      };
    }

    const findingId = report.finding_id ?? '';
    const finding = findings.get(findingId);
    if (!finding || finding.deleted_at) return tomtMaal('finding', findingId);
    const shownAs = funnVisning(finding);
    const erPrivat = shownAs === 'private';
    const art = Array.isArray(finding.mushroom_species) ? finding.mushroom_species[0] : finding.mushroom_species;
    return {
      ...tomtMaal('finding', finding.id),
      missing: false,
      // Notatet kan røpe stedet. Viewet skjuler det derfor for omtrentlige funn
      // og sonefunn, og da skal det heller ikke stå i konsollen: melderen så
      // det aldri, og kan ikke ha meldt det.
      excerpt: shownAs === 'public' ? utdrag(finding.notes) : null,
      images: erPrivat ? [] : bildeUrler([finding.thumbnail_url]),
      authorUsername: forfatter(finding.user_id),
      species: art ? { norwegian_name: art.norwegian_name ?? null, swedish_name: art.swedish_name ?? null } : null,
      // Fritekst fra eieren, som notatet. Fra et privat funn slipper den ikke ut.
      speciesOverride: erPrivat ? null : finding.species_name_override,
      foundAt: finding.found_at,
      shownAs,
      zoneLabel: shownAs === 'zone' ? (finding.zone_label ?? null) : null
    };
  };

  return inn.reports.map((report) => ({
    id: report.id,
    reason: report.reason,
    description: report.description,
    status: report.status,
    createdAt: report.created_at,
    target: maalFor(report)
  }));
}

export interface AapneRapporter {
  antall: number;
  /** Hele timer siden den eldste åpne rapporten kom inn; null når ingen er åpne. */
  eldsteTimer: number | null;
  /** Apple (retningslinje 1.2) venter at meldinger behandles innen ett døgn. */
  over24t: boolean;
}

export const BEHANDLINGSFRIST_TIMER = 24;

export function oppsummerAapneRapporter(inn: {
  antall: number;
  eldsteOpprettet: string | null | undefined;
  naa: Date;
}): AapneRapporter {
  const antall = Math.max(0, Math.floor(inn.antall || 0));
  const eldsteMs = inn.eldsteOpprettet ? Date.parse(inn.eldsteOpprettet) : NaN;
  if (antall === 0 || Number.isNaN(eldsteMs)) {
    return { antall, eldsteTimer: null, over24t: false };
  }
  const eldsteTimer = Math.max(0, Math.floor((inn.naa.getTime() - eldsteMs) / 3_600_000));
  return { antall, eldsteTimer, over24t: eldsteTimer >= BEHANDLINGSFRIST_TIMER };
}
