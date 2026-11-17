import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Forumtellerne — migrasjon 076.
 *
 * comments_count og likes_count flyttet seg bare når innleggets egen forfatter
 * kommenterte eller likte. Tellerfunksjonene (001, og kommentartelleren igjen
 * i 041) var SECURITY INVOKER, og den eneste UPDATE-policyen på forum_posts
 * slipper bare forfatteren til. Andres kommentarer og likes oppdaterte 0 rader
 * uten feil: et besvart spørsmål sto under «Ubesvarte» (sporring.ts leter
 * etter comments_count = 0), og en like fra noen andre forsvant igjen.
 *
 * SQL kan ikke kjøres her (det finnes ingen Postgres i testmiljøet, og bare én
 * database — produksjon). Filene leses derfor som tekst og holdes opp mot det
 * som gjør rettingen riktig og trygg å lime inn — og mot det som kan gjøre den
 * om igjen: 041 skriver den samme kommentarfunksjonen.
 */

const MIGRASJONER = join(process.cwd(), 'supabase', 'migrations');
const filnavn = readdirSync(MIGRASJONER).find((f) => /^076_.+\.sql$/.test(f)) ?? '';
const les = (fil: string) => readFileSync(join(MIGRASJONER, fil), 'utf8');

/** Bare det som kjøres: uten kommentarer, med ett mellomrom mellom ordene. */
function utenKommentarer(raa: string): string {
  return raa
    .split('\n')
    .map((linje) => linje.replace(/--.*$/, ''))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim();
}

const sql076 = utenKommentarer(filnavn ? les(filnavn) : '');
const sql041 = utenKommentarer(les('041_hidden_content_counters.sql'));

/**
 * Hele setningen fra «create or replace function <navn>()» til semikolonet
 * etter kroppen. 041 har språk og sikkerhet ETTER kroppen, 076 før den.
 */
function funksjon(sql: string, navn: string): string {
  const start = sql.search(new RegExp(`create or replace function (public\\.)?${navn}\\(\\)`));
  if (start < 0) return '';
  const aapning = sql.indexOf('$$', start);
  const lukking = aapning < 0 ? -1 : sql.indexOf('$$', aapning + 2);
  const slutt = lukking < 0 ? -1 : sql.indexOf(';', lukking);
  return slutt < 0 ? '' : sql.slice(start, slutt + 1);
}

/** Kroppen mellom $$ og $$. */
function kropp(definisjon: string): string {
  const m = definisjon.match(/\$\$ (.*) \$\$/);
  return m ? m[1] : '';
}

const kommentarteller = funksjon(sql076, 'update_post_comment_count');
const liketeller = funksjon(sql076, 'update_post_likes_count');

describe('migrasjon 076 — tellerne teller alle', () => {
  it('finnes, og har begge funksjonene', () => {
    expect(filnavn).not.toBe('');
    expect(kommentarteller).not.toBe('');
    expect(liketeller).not.toBe('');
  });

  it('kjører begge tellerne som eier, med låst search_path', () => {
    // Uten SECURITY DEFINER kjører triggeren som den som kommenterer, og RLS
    // på forum_posts slipper bare forfatteren til: 0 rader, ingen feil.
    for (const definisjon of [kommentarteller, liketeller]) {
      const hode = definisjon.slice(0, definisjon.indexOf('$$'));
      expect(hode).toContain('returns trigger');
      expect(hode).toContain('security definer');
      expect(hode).toContain('set search_path = public, pg_temp');
    }
  });

  it('skriver bare tallet på innlegget raden hører til, med fullt tabellnavn', () => {
    const oppdateringer = [kommentarteller, liketeller].flatMap((d) => kropp(d).match(/update [^;]*;/g) ?? []);
    expect(oppdateringer).toHaveLength(8);
    for (const setning of oppdateringer) {
      expect(setning).toMatch(
        /^update public\.forum_posts set (comments_count|likes_count) = [^;]* where id = (new|old)\.post_id;$/
      );
    }
  });

  it('lar kommentartelleren følge is_hidden som i 041, og trekker aldri under 0', () => {
    const k = kropp(kommentarteller);
    // INSERT og DELETE teller bare en synlig kommentar.
    expect(k).toContain(
      "if tg_op = 'INSERT' then if coalesce(new.is_hidden, false) = false then update public.forum_posts set comments_count = comments_count + 1 where id = new.post_id;"
    );
    expect(k).toContain(
      "elsif tg_op = 'DELETE' then if coalesce(old.is_hidden, false) = false then update public.forum_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;"
    );
    // UPDATE: skjules −1, vises igjen +1.
    expect(k).toContain(
      'if coalesce(old.is_hidden, false) = false and coalesce(new.is_hidden, false) = true then update public.forum_posts set comments_count = greatest(comments_count - 1, 0) where id = new.post_id;'
    );
    expect(k).toContain(
      'elsif coalesce(old.is_hidden, false) = true and coalesce(new.is_hidden, false) = false then update public.forum_posts set comments_count = comments_count + 1 where id = new.post_id;'
    );
  });

  it('lar tallet følge en kommentar som flyttes til et annet innlegg — og ser etter flyttingen først', () => {
    // UPDATE-policyen på comments (001, 058) har bare USING, så forfatteren
    // kan endre post_id på sin egen kommentar. En definer-teller som bare så
    // på is_hidden, lot hvem som helst flytte en kommentar til et annet
    // innlegg og slette den der: −1 på et innlegg den aldri ble lagt til i.
    // Gjentatt nuller det tallet; motsatt vei blåser det opp. Flyttegrenen må
    // stå først, ellers justeres en kommentar som både flyttes og skjules
    // bare på det nye innlegget.
    expect(kropp(kommentarteller)).toContain(
      "elsif tg_op = 'UPDATE' then if old.post_id is distinct from new.post_id then " +
        'if coalesce(old.is_hidden, false) = false then update public.forum_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id; end if; ' +
        'if coalesce(new.is_hidden, false) = false then update public.forum_posts set comments_count = comments_count + 1 where id = new.post_id; end if; ' +
        'elsif coalesce(old.is_hidden, false) = false and coalesce(new.is_hidden, false) = true then'
    );
  });

  it('lar innloggede bare endre teksten i en kommentar — et ekstra lag, ikke vernet', () => {
    // Appen endrer bare content. REVOKE først: en kolonnerettighet oppå en
    // tabellrettighet endrer ingenting (som i 074). Vernet er flyttegrenen
    // over: GRANT ALL-blokka i CLAUDE.md åpner kolonnene igjen.
    expect(sql076).toContain(
      'revoke update on public.comments from anon, authenticated; grant update (content) on public.comments to authenticated;'
    );
    expect(sql076.indexOf('grant update (content)')).toBeLessThan(sql076.indexOf('update public.forum_posts as p'));
  });

  it('trekker aldri fra uten et gulv på 0', () => {
    for (const k of [kropp(kommentarteller), kropp(liketeller)]) {
      const fratrekk = k.match(/_count - 1/g) ?? [];
      const medGulv = k.match(/greatest\((comments|likes)_count - 1, 0\)/g) ?? [];
      expect(fratrekk.length).toBeGreaterThan(0);
      expect(medGulv).toHaveLength(fratrekk.length);
    }
  });

  it('oppretter begge triggerne på nytt — kommentartriggeren også på UPDATE', () => {
    expect(sql076).toContain(
      'drop trigger if exists comments_count_trigger on public.comments; create trigger comments_count_trigger after insert or update or delete on public.comments for each row execute function public.update_post_comment_count();'
    );
    expect(sql076).toContain(
      'drop trigger if exists post_likes_count_trigger on public.post_likes; create trigger post_likes_count_trigger after insert or delete on public.post_likes for each row execute function public.update_post_likes_count();'
    );
  });

  it('regner om begge tallene etter samme regel som triggeren, og rører bare innlegg som er feil', () => {
    const omregning = sql076.slice(sql076.indexOf('update public.forum_posts as p'), sql076.lastIndexOf('commit;'));
    expect(omregning).toContain('set comments_count = fasit.synlige_kommentarer, likes_count = fasit.likes');
    expect(omregning).toContain(
      '(select count(*) from public.comments as c where c.post_id = fp.id and coalesce(c.is_hidden, false) = false) as synlige_kommentarer'
    );
    expect(omregning).toContain('(select count(*) from public.post_likes as l where l.post_id = fp.id) as likes');
    expect(omregning).toContain(
      'and (p.comments_count is distinct from fasit.synlige_kommentarer or p.likes_count is distinct from fasit.likes);'
    );
  });

  it('kjører alt i én transaksjon, med omregningen til slutt', () => {
    expect(sql076.startsWith('begin;')).toBe(true);
    expect(sql076.endsWith('commit;')).toBe(true);
    expect(sql076.match(/\bbegin;/g) ?? []).toHaveLength(1);
    expect(sql076.match(/\bcommit;/g) ?? []).toHaveLength(1);
    expect(sql076.indexOf('update public.forum_posts as p')).toBeGreaterThan(sql076.lastIndexOf('create trigger'));
  });

  it('er idempotent, og rører ikke get_user_stats (der 041 og 056 kolliderer)', () => {
    expect(sql076).not.toMatch(/\bcreate (table|index|policy|view)\b|\binsert into\b|\bdelete from\b|\bdrop function\b|\balter table\b/);
    expect(sql076).not.toMatch(/\bcreate function\b/);
    expect(sql076).not.toContain('get_user_stats');
    // Hver trigger som opprettes, slettes først om den finnes.
    const opprettet = [...sql076.matchAll(/create trigger (\w+)/g)].map((m) => m[1]);
    expect(opprettet.sort()).toEqual(['comments_count_trigger', 'post_likes_count_trigger']);
    for (const navn of opprettet) {
      expect(sql076.indexOf(`drop trigger if exists ${navn} `)).toBeLessThan(sql076.indexOf(`create trigger ${navn} `));
    }
  });
});

describe('041 kan ikke gjøre 076 om igjen', () => {
  const kommentarteller041 = funksjon(sql041, 'update_post_comment_count');

  it('kjører også kommentartelleren i 041 som eier', () => {
    // CREATE OR REPLACE setter sikkerhetsattributtene på nytt. Var 041 fortsatt
    // invoker, ville den gjort telleren blind for andres kommentarer igjen.
    expect(kommentarteller041).not.toBe('');
    const etter = kommentarteller041.slice(kommentarteller041.lastIndexOf('$$'));
    expect(etter).toContain('security definer');
    expect(etter).toContain('set search_path = public, pg_temp');
  });

  it('har samme regel som 076 — den som limes inn sist, endrer ingenting', () => {
    const uten = (k: string) => k.replace(/public\./g, '');
    expect(uten(kropp(kommentarteller041))).toBe(uten(kropp(kommentarteller)));
  });

  it('sier i filhodet at 076 skal limes inn i stedet', () => {
    const hode = les('041_hidden_content_counters.sql').split('\nbegin;')[0];
    expect(hode).toContain('LIM INN 076 I STEDET');
    expect(hode).toContain(filnavn);
  });
});

describe('hovedboka og 076', () => {
  const hovedbok = readFileSync(join(process.cwd(), 'docs', 'migrasjoner-a-kjore.md'), 'utf8');
  const rad = hovedbok.match(/^\s*\('076', (.*)\),?$/m)?.[1] ?? '';

  it('leter etter sporene 076 etterlater', () => {
    expect(rad).toContain("to_regproc('public.update_post_comment_count') AND prosecdef");
    expect(rad).toContain("to_regproc('public.update_post_likes_count') AND prosecdef");
    expect(rad).toContain("tgname = 'comments_count_trigger' AND (tgtype & 16) <> 0");
    expect(rad).toContain("tgname = 'post_likes_count_trigger'");
  });

  it('teller synlige kommentarer etter samme regel som migrasjonen', () => {
    // «IS NOT TRUE» er coalesce(is_hidden, false) = false uten et
    // funksjonskall — spørringen i hovedboka får bare kalle et fåtall
    // funksjoner (migrasjonshovedbok.test.ts).
    expect(rad).toContain('c.is_hidden IS NOT TRUE');
    expect(rad).toContain('fp.likes_count IS DISTINCT FROM (SELECT count(*) FROM post_likes l WHERE l.post_id = fp.id)');
  });

  it('sier at 041 ikke skal limes inn, og at raden blir true når 076 er kjørt', () => {
    expect(hovedbok).toMatch(/^\| 041 \| `041_hidden_content_counters\.sql` \| [^|]+ \| Avløst av 076/m);
    expect(hovedbok).toContain('**041** blir `true` også når 076 er kjørt');
  });
});
