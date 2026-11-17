import { describe, expect, it } from 'vitest';
import {
  AAPNE_RAPPORTSTATUSER,
  bildeUrler,
  byggRapportvisning,
  erAapenRapport,
  erModerationAction,
  funnVisning,
  oppsummerAapneRapporter,
  utdrag,
  type ModerationFindingRow,
  type ModerationReportRow
} from '../moderering';
import { REPORT_REASONS, reportReasonLabelKey } from '../report-reasons';
import nb from '../../../../messages/nb.json';
import sv from '../../../../messages/sv.json';

function rapport(over: Partial<ModerationReportRow>): ModerationReportRow {
  return {
    id: 'r1',
    reason: 'dangerous_advice',
    description: null,
    status: 'pending',
    created_at: '2026-09-01T10:00:00Z',
    post_id: null,
    comment_id: null,
    finding_id: null,
    ...over
  };
}

/** Et funn med notat, bilde og egenskrevet artsnavn — alt som kan lekke. */
function funn(over: Partial<ModerationFindingRow>): ModerationFindingRow {
  return {
    id: 'f1',
    user_id: 'u1',
    species_name_override: 'Min hemmelige kantarell',
    found_at: '2026-08-20T08:00:00Z',
    visibility: 'public',
    is_zone_finding: false,
    zone_label: null,
    notes: 'Bak låven, tredje gran fra bekken',
    thumbnail_url: 'https://example.com/funn.jpg',
    mushroom_species: null,
    ...over
  };
}

function funnMaal(over: Partial<ModerationFindingRow>) {
  const [item] = byggRapportvisning({
    reports: [rapport({ finding_id: 'f1', reason: 'privacy' })],
    posts: [],
    comments: [],
    findings: [funn(over)],
    profiles: [{ id: 'u1', username: 'finner' }]
  });
  return item;
}

describe('byggRapportvisning', () => {
  it('viser innlegget som er meldt: tittel, utdrag, bilder og forfatter', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ post_id: 'p1' })],
      posts: [
        {
          id: 'p1',
          user_id: 'u1',
          title: 'Hvit fluesopp er spiselig',
          content: 'Bare stek den godt.',
          images: [{ url: 'https://example.com/a.jpg', thumbnail_url: 'https://example.com/a-thumb.jpg' }],
          is_hidden: false
        }
      ],
      comments: [],
      findings: [],
      profiles: [{ id: 'u1', username: 'soppvenn' }]
    });

    expect(item.target).toMatchObject({
      type: 'post',
      missing: false,
      postId: 'p1',
      threadVisible: true,
      title: 'Hvit fluesopp er spiselig',
      excerpt: 'Bare stek den godt.',
      images: ['https://example.com/a-thumb.jpg'],
      isHidden: false,
      canHide: true,
      authorUsername: 'soppvenn'
    });
  });

  it('lenker ikke til en tråd som er skjult — den er usynlig også for moderatoren', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ post_id: 'p1' })],
      posts: [{ id: 'p1', user_id: 'u1', title: 't', content: 'c', images: [], is_hidden: true }],
      comments: [],
      findings: [],
      profiles: []
    });
    expect(item.target.isHidden).toBe(true);
    expect(item.target.threadVisible).toBe(false);
  });

  it('viser en meldt kommentar med tråden den står i', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ comment_id: 'c1' })],
      posts: [{ id: 'p1', user_id: 'u1', title: 'Trådtittel', content: 'x', images: [], is_hidden: false }],
      comments: [{ id: 'c1', user_id: 'u2', post_id: 'p1', content: 'Stygg kommentar', is_hidden: true }],
      findings: [],
      profiles: [{ id: 'u2', username: 'bråkmaker' }]
    });
    expect(item.target).toMatchObject({
      type: 'comment',
      id: 'c1',
      postId: 'p1',
      threadVisible: true,
      title: 'Trådtittel',
      excerpt: 'Stygg kommentar',
      isHidden: true,
      canHide: true,
      authorUsername: 'bråkmaker'
    });
  });

  it('merker slettet innhold som borte i stedet for å kaste', () => {
    const items = byggRapportvisning({
      reports: [rapport({ id: 'a', post_id: 'borte' }), rapport({ id: 'b', comment_id: 'borte' }), rapport({ id: 'c', finding_id: 'borte' })],
      posts: [],
      comments: [],
      findings: [],
      profiles: []
    });
    expect(items.map((i) => i.target.missing)).toEqual([true, true, true]);
    expect(items.map((i) => i.target.canHide)).toEqual([false, false, false]);
  });

  it('funn: art og dato, aldri skjulbart', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ finding_id: 'f1', reason: 'protected_species' })],
      posts: [],
      comments: [],
      findings: [
        {
          id: 'f1',
          user_id: 'u1',
          species_name_override: null,
          found_at: '2026-08-20T08:00:00Z',
          visibility: 'public',
          is_zone_finding: false,
          notes: 'Ved hytta til naboen',
          thumbnail_url: 'https://example.com/f.jpg',
          mushroom_species: [{ norwegian_name: 'Kantarell', swedish_name: 'Kantarell' }]
        }
      ],
      profiles: [{ id: 'u1', username: 'finner' }]
    });
    expect(item.target).toMatchObject({
      type: 'finding',
      id: 'f1',
      canHide: false,
      excerpt: 'Ved hytta til naboen',
      images: ['https://example.com/f.jpg'],
      species: { norwegian_name: 'Kantarell', swedish_name: 'Kantarell' },
      foundAt: '2026-08-20T08:00:00Z',
      authorUsername: 'finner',
      shownAs: 'public',
      zoneLabel: null
    });
  });

  // Viewet public_findings (migrasjon 023 og 056) skjuler notatet for alt som
  // ikke er helt offentlig, fordi det kan røpe stedet. Konsollen viste det
  // likevel for omtrentlige funn og sonefunn — til alle med moderatorrolle,
  // selv om verken melderen eller noen annen leser kunne se det.
  it('funn: notatet fra et omtrentlig funn slipper ikke ut, men bildet gjør det', () => {
    const item = funnMaal({ visibility: 'approximate' });
    expect(item.target.excerpt).toBeNull();
    expect(item.target.images).toEqual(['https://example.com/funn.jpg']);
    expect(item.target.shownAs).toBe('approximate');
    expect(JSON.stringify(item)).not.toContain('låven');
  });

  it('funn: notatet fra et offentlig sonefunn slipper ikke ut, sonenavnet gjør det', () => {
    const item = funnMaal({ visibility: 'public', is_zone_finding: true, zone_label: 'Nordmarka sør' });
    expect(item.target.excerpt).toBeNull();
    expect(item.target.shownAs).toBe('zone');
    expect(item.target.zoneLabel).toBe('Nordmarka sør');
    expect(JSON.stringify(item)).not.toContain('låven');
  });

  it('funn: mangler soneflagget, holdes notatet tilbake', () => {
    // I SQL er NULL ikke lik false, så viewet ville også skjult notatet. En
    // spørring som glemmer kolonnen skal ikke bli en lekkasje.
    const item = funnMaal({ visibility: 'public', is_zone_finding: undefined });
    expect(item.target.excerpt).toBeNull();
    expect(item.target.shownAs).not.toBe('public');
  });

  it('funn: sonenavnet følger bare med for sonefunn andre kan se', () => {
    expect(funnMaal({ zone_label: 'Gammel sone', is_zone_finding: false }).target.zoneLabel).toBeNull();
    expect(funnMaal({ visibility: 'private', is_zone_finding: true, zone_label: 'Hemmelig sone' }).target.zoneLabel).toBeNull();
  });

  it('funn: notat og bilde fra et privat funn slipper ikke ut', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ finding_id: 'f1' })],
      posts: [],
      comments: [],
      findings: [
        {
          id: 'f1',
          user_id: 'u1',
          species_name_override: 'Steinsopp',
          found_at: '2026-08-20T08:00:00Z',
          visibility: 'private',
          notes: 'Hemmelig sted bak låven',
          thumbnail_url: 'https://example.com/privat.jpg',
          mushroom_species: null
        }
      ],
      profiles: []
    });
    expect(item.target.excerpt).toBeNull();
    expect(item.target.images).toEqual([]);
    expect(JSON.stringify(item)).not.toContain('Hemmelig');
  });

  it('funn: artsnavnet eieren selv har skrevet slipper ikke ut fra et privat funn', () => {
    // Fritekst, som notatet. For funn andre kan se er navnet det moderatoren
    // har å gå etter når arten ikke står i artslista.
    const privat = funnMaal({ visibility: 'private' });
    expect(privat.target.speciesOverride).toBeNull();
    expect(privat.target.shownAs).toBe('private');
    expect(JSON.stringify(privat)).not.toMatch(/hemmelige|låven|funn\.jpg/);

    expect(funnMaal({ visibility: 'public' }).target.speciesOverride).toBe('Min hemmelige kantarell');
    expect(funnMaal({ visibility: 'approximate' }).target.speciesOverride).toBe('Min hemmelige kantarell');
  });

  it('funn: en ukjent synlighet behandles som privat', () => {
    const item = funnMaal({ visibility: null });
    expect(item.target).toMatchObject({ shownAs: 'private', excerpt: null, images: [], speciesOverride: null });
  });

  it('innlegg og kommentarer har ingen funnvisning', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ post_id: 'p1' })],
      posts: [{ id: 'p1', user_id: 'u1', title: 't', content: 'c', images: [], is_hidden: false }],
      comments: [],
      findings: [],
      profiles: []
    });
    expect(item.target.shownAs).toBeNull();
    expect(item.target.zoneLabel).toBeNull();
  });

  it('funn: et funn eieren har slettet regnes som borte', () => {
    const [item] = byggRapportvisning({
      reports: [rapport({ finding_id: 'f1' })],
      posts: [],
      comments: [],
      findings: [
        {
          id: 'f1',
          user_id: 'u1',
          species_name_override: null,
          found_at: null,
          visibility: 'public',
          notes: 'x',
          thumbnail_url: null,
          deleted_at: '2026-09-01T00:00:00Z'
        }
      ],
      profiles: []
    });
    expect(item.target.missing).toBe(true);
    expect(item.target.excerpt).toBeNull();
  });

  it('gir aldri videre hvem som meldte, eller ukjente kolonner fra radene', () => {
    const items = byggRapportvisning({
      reports: [rapport({ post_id: 'p1', reporter_id: 'melder-123' })],
      posts: [
        { id: 'p1', user_id: 'forfatter-9', title: 't', content: 'c', images: [], is_hidden: false, latitude: 59.9 } as never
      ],
      comments: [],
      findings: [],
      profiles: [{ id: 'forfatter-9', username: 'navn' }]
    });
    const json = JSON.stringify(items);
    expect(json).not.toContain('melder-123');
    expect(json).not.toContain('reporter');
    expect(json).not.toContain('latitude');
    expect(json).not.toContain('forfatter-9');
  });
});

describe('funnVisning', () => {
  it('følger grenene i public_findings', () => {
    expect(funnVisning({ visibility: 'public', is_zone_finding: false })).toBe('public');
    expect(funnVisning({ visibility: 'approximate', is_zone_finding: false })).toBe('approximate');
    expect(funnVisning({ visibility: 'public', is_zone_finding: true })).toBe('zone');
    expect(funnVisning({ visibility: 'approximate', is_zone_finding: true })).toBe('zone');
    expect(funnVisning({ visibility: 'private', is_zone_finding: false })).toBe('private');
    expect(funnVisning({ visibility: 'private', is_zone_finding: true })).toBe('private');
  });

  it('gir aldri «helt offentlig» uten et uttrykkelig false på soneflagget', () => {
    expect(funnVisning({ visibility: 'public', is_zone_finding: null })).toBe('approximate');
    expect(funnVisning({ visibility: 'public' })).toBe('approximate');
    expect(funnVisning({ visibility: 'noe_nytt', is_zone_finding: false })).toBe('private');
  });
});

describe('utdrag og bildeUrler', () => {
  it('kutter lange tekster og lar korte stå', () => {
    expect(utdrag('  kort  ')).toBe('kort');
    expect(utdrag('')).toBeNull();
    expect(utdrag(null)).toBeNull();
    expect(utdrag('a'.repeat(50), 10)).toBe(`${'a'.repeat(10)}…`);
  });

  it('tar bare http(s)-adresser, og tåler at feltet ikke er en liste', () => {
    expect(bildeUrler(null)).toEqual([]);
    expect(bildeUrler('nei')).toEqual([]);
    expect(
      bildeUrler([{ url: 'https://example.com/1.jpg' }, 'https://example.com/2.jpg', { url: 'javascript:alert(1)' }, null, { url: 5 }])
    ).toEqual(['https://example.com/1.jpg', 'https://example.com/2.jpg']);
  });
});

describe('oppsummerAapneRapporter', () => {
  const naa = new Date('2026-09-02T12:00:00Z');

  it('ingen åpne rapporter gir ingen alder og ingen varsel', () => {
    expect(oppsummerAapneRapporter({ antall: 0, eldsteOpprettet: null, naa })).toEqual({ antall: 0, eldsteTimer: null, over24t: false });
  });

  it('teller hele timer siden den eldste', () => {
    expect(oppsummerAapneRapporter({ antall: 2, eldsteOpprettet: '2026-09-02T06:30:00Z', naa })).toEqual({
      antall: 2,
      eldsteTimer: 5,
      over24t: false
    });
  });

  it('varsler når den eldste har ligget et døgn', () => {
    expect(oppsummerAapneRapporter({ antall: 1, eldsteOpprettet: '2026-09-01T12:00:00Z', naa }).over24t).toBe(true);
    expect(oppsummerAapneRapporter({ antall: 1, eldsteOpprettet: '2026-09-01T12:00:01Z', naa }).over24t).toBe(false);
  });

  it('en ugyldig dato blir ikke til en falsk alder', () => {
    expect(oppsummerAapneRapporter({ antall: 3, eldsteOpprettet: 'tull', naa })).toEqual({ antall: 3, eldsteTimer: null, over24t: false });
  });
});

describe('åpne rapporter', () => {
  it('«gjennomgått» er sett, ikke avsluttet — den teller som åpen', () => {
    expect([...AAPNE_RAPPORTSTATUSER].sort()).toEqual(['pending', 'reviewed']);
    expect(erAapenRapport('pending')).toBe(true);
    expect(erAapenRapport('reviewed')).toBe(true);
    expect(erAapenRapport('resolved')).toBe(false);
    expect(erAapenRapport('dismissed')).toBe(false);
    expect(erAapenRapport(null)).toBe(false);
    expect(erAapenRapport(undefined)).toBe(false);
  });
});

describe('meldegrunner', () => {
  it('erModerationAction slipper bare de fem handlingene gjennom', () => {
    expect(['hide', 'unhide', 'dismiss', 'reviewed', 'resolve'].every(erModerationAction)).toBe(true);
    expect(erModerationAction('delete')).toBe(false);
    expect(erModerationAction('resolved')).toBe(false);
    expect(erModerationAction(undefined)).toBe(false);
  });

  it('konsollens tekster finnes på begge språk, og svensk er ikke en kopi', () => {
    const nokler = [
      'markResolved',
      'doneResolve',
      'findingId',
      'findingShownPublic',
      'findingShownApproximate',
      'findingShownZone',
      'findingShownPrivate',
      'findingZone'
    ];
    const norsk = nb.ForumModeration as Record<string, string>;
    const svensk = sv.ForumModeration as Record<string, string>;
    for (const key of nokler) {
      expect(norsk[key], `nb ${key}`).toBeTruthy();
      expect(svensk[key], `sv ${key}`).toBeTruthy();
    }
    for (const key of ['doneResolve', 'findingShownPublic', 'findingShownApproximate', 'findingShownZone', 'findingShownPrivate']) {
      expect(svensk[key], key).not.toBe(norsk[key]);
    }
    // Plassholderen må overleve oversettelsen.
    expect(norsk.findingZone).toContain('{zone}');
    expect(svensk.findingZone).toContain('{zone}');
  });

  it('hver meldegrunn har tekst på både norsk og svensk', () => {
    for (const { value, labelKey } of REPORT_REASONS) {
      expect(reportReasonLabelKey(value)).toBe(labelKey);
      expect((nb.ReportButton as Record<string, string>)[labelKey], `nb ${labelKey}`).toBeTruthy();
      expect((sv.ReportButton as Record<string, string>)[labelKey], `sv ${labelKey}`).toBeTruthy();
    }
  });

  it('en ukjent grunn gir null, så kallstedet kan vise råverdien', () => {
    expect(reportReasonLabelKey('noe_nytt')).toBeNull();
    expect(reportReasonLabelKey(null)).toBeNull();
  });
});
