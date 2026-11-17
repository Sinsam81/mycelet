-- 076: Forumtellerne skal telle kommentarer og likes fra alle — ikke bare fra
-- den som skrev innlegget.
--
-- KJØRES SLIK: lim HELE fila inn i Supabase SQL Editor i én omgang, uten å
-- merke noe av teksten først. Alt skjer i én transaksjon: går noe galt
-- underveis, er ingenting endret. Idempotent — limes den inn to ganger, gjør
-- andre gang ingenting nytt.
--
-- Fila står på egne ben: den virker enten 041 er kjørt eller ikke, og den er
-- ikke avhengig av noen utgivelse av appen. Koden virker både før og etter.
--
-- FEILEN
-- forum_posts.comments_count og forum_posts.likes_count holdes ved like av to
-- triggere fra 001: update_post_comment_count på comments og
-- update_post_likes_count på post_likes. Begge var vanlige plpgsql-funksjoner,
-- altså SECURITY INVOKER: de kjører med rettighetene til den som skriver
-- raden. Kommentarer og likes skrives rett fra nettleseren som `authenticated`
-- (src/lib/hooks/useForum.ts), og den eneste UPDATE-policyen på forum_posts er
-- «Brukere kan redigere egne innlegg» — auth.uid() = user_id (001 og 058).
--
-- Når B kommenterer eller liker innlegget til A, kjører triggerens
-- `update forum_posts …` derfor som B. RLS filtrerer bort raden, og
-- oppdateringen treffer 0 rader — uten feilmelding. Bare forfatterens egne
-- kommentarer og likes har noen gang flyttet tallene. Det synes slik:
--
--  - Et spørsmål andre har svart på, blir stående under «Ubesvarte», som
--    leter etter comments_count = 0 (src/lib/forum/sporring.ts), og kortet
--    viser 0 kommentarer.
--  - En like fra noen andre «hopper tilbake» i det appen henter tallet på
--    nytt, og «Populære» sorterer som om den aldri kom.
--  - Skjuler en moderator en kommentar, trekkes den fra et tall den aldri ble
--    lagt til i. Moderasjonskonsollen skriver med tjenesterollen, som RLS ikke
--    stopper, så med 041 kjørt går fratrekket gjennom: A kommenterer sitt eget
--    innlegg (1), B svarer (fortsatt 1, to vises), B sin kommentar skjules
--    (0) — mens A sin fortsatt vises. Innlegget havner i «Ubesvarte».
--  - Trolig også kontosletting: likes slettes da i en kaskade fra auth.users,
--    og en trigger som fyrer i en kaskade, kjører som rollen som startet
--    slettingen — Supabase sin auth-tjeneste, ikke `postgres`. Uten rett til
--    å oppdatere forum_posts kan den stoppe hele slettingen. Ikke prøvd mot
--    databasen; som eier kjører telleren likt uansett hvem som sletter.
--
-- 041 lot kommentartelleren følge is_hidden, men beholdt INVOKER. Den rettet
-- altså ikke dette.
--
-- RETTINGEN
--  1. Begge funksjonene blir SECURITY DEFINER: de kjører som eieren
--     (`postgres`), og RLS stopper ikke lenger tellingen. search_path er låst
--     (public, med pg_temp sist), og tabellnavnene er skrevet fullt ut.
--     Triggerfunksjoner kan ikke kalles direkte — heller ikke gjennom
--     API-et. Men som eier skriver telleren på innlegg brukeren selv ikke får
--     endre, så den må stemme for alt en bruker FÅR gjøre med sin egen rad.
--     UPDATE-policyen på comments (001, 058) har bare USING
--     (auth.uid() = user_id): forfatteren kan endre post_id på sin egen
--     kommentar. En teller som bare så på is_hidden, lot da hvem som helst
--     nulle tallet på et annet innlegg — flytt kommentaren dit og slett den,
--     så trekkes den fra der — eller blåse det opp andre veien. Som invoker
--     traff det fratrekket 0 rader; det er definer-telleren som ville åpnet
--     den døra. Derfor følger telleren flyttingen (punkt 2).
--  2. Kommentartelleren følger kommentaren: en skjult kommentar telles ikke,
--     skjules den −1, vises den igjen +1 (som i 041), og flyttes den til et
--     annet innlegg, −1 på det gamle om den var synlig og +1 på det nye om
--     den er synlig. Flyttingen sjekkes først. Alt som trekker fra, stopper
--     på 0.
--  3. Begge triggerne opprettes på nytt — kommentartriggeren også på UPDATE.
--  4. Innloggede får bare endre teksten (content) i en kommentar — det eneste
--     appen endrer. Det er et ekstra lag, ikke vernet: GRANT-blokka i
--     CLAUDE.md for gjenoppretting etter DROP SCHEMA (GRANT ALL ON ALL TABLES
--     …) åpner kolonnene igjen uten et ord, og hovedboka ser ikke etter det.
--     Vernet er punkt 2, som holder tallene riktige uansett hvem som får
--     endre post_id. Lim inn fila på nytt etter en slik gjenoppretting for å
--     få laget tilbake.
--  5. Begge tallene regnes om fra radene i samme transaksjon. Bare innlegg der
--     et tall faktisk er feil, røres.
--
-- MERK: hver telleroppdatering setter også forum_posts.updated_at (triggeren
-- forum_posts_updated_at fra 001). Slik har det alltid vært for forfatterens
-- egne kommentarer; nå gjelder det alle. Ingenting i appen leser updated_at på
-- innlegg, og den skal ikke brukes som «redigert».
--
-- 041 ETTER DENNE: 041 skriver den samme kommentarfunksjonen. Siden
-- 16. november 2026 er også 041s utgave SECURITY DEFINER, så den gjør ikke
-- telleren blind igjen, og fra 17. november har den den samme flyttegrenen.
-- 041 skal likevel ikke limes inn: denne fila gjør del 2 og 3 av den, og del
-- 1 kolliderer med 056 (se hovedboka). Når 076 er kjørt, står raden 041 i
-- hovedboka også som `true`. Blir raden 076 `false` igjen senere, er en eldre
-- utgave limt inn etterpå, eller tallene endret for hånd: lim inn denne fila
-- på nytt.

begin;

-- ── 1: kommentartelleren ───────────────────────────────────────────────────
-- Samme regel som 041. Triggeren må reagere på fire ting: INSERT og DELETE av
-- en synlig kommentar, UPDATE der post_id endres, og UPDATE der is_hidden
-- snur — ellers ville moderering aldri justere tallet. Flyttingen sjekkes
-- først: en kommentar som både flyttes og skjules (eller vises igjen), skal
-- trekkes fra der den sto og telles der den havner, ikke bare justeres på det
-- nye innlegget.

create or replace function public.update_post_comment_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_hidden, false) = false then
      update public.forum_posts set comments_count = comments_count + 1 where id = new.post_id;
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(old.is_hidden, false) = false then
      update public.forum_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;
    end if;
  elsif tg_op = 'UPDATE' then
    -- Flyttet til et annet innlegg (forfatteren kan endre post_id): tallet
    -- følger kommentaren. Sjekkes før is_hidden.
    if old.post_id is distinct from new.post_id then
      if coalesce(old.is_hidden, false) = false then
        update public.forum_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;
      end if;
      if coalesce(new.is_hidden, false) = false then
        update public.forum_posts set comments_count = comments_count + 1 where id = new.post_id;
      end if;
    elsif coalesce(old.is_hidden, false) = false and coalesce(new.is_hidden, false) = true then
      update public.forum_posts set comments_count = greatest(comments_count - 1, 0) where id = new.post_id;
    elsif coalesce(old.is_hidden, false) = true and coalesce(new.is_hidden, false) = false then
      update public.forum_posts set comments_count = comments_count + 1 where id = new.post_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.update_post_comment_count() is
  'Holder forum_posts.comments_count lik antall synlige kommentarer, også når en kommentar skjules, vises igjen eller flyttes til et annet innlegg. SECURITY DEFINER: kommentarer skrives som den innloggede brukeren, og RLS lar bare forfatteren oppdatere et innlegg — som invoker telte den bare forfatterens egne (migrasjon 076).';

-- ── 2: liketelleren ────────────────────────────────────────────────────────

create or replace function public.update_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    update public.forum_posts set likes_count = likes_count + 1 where id = new.post_id;
  elsif tg_op = 'DELETE' then
    update public.forum_posts set likes_count = greatest(likes_count - 1, 0) where id = old.post_id;
  end if;
  return coalesce(new, old);
end;
$$;

comment on function public.update_post_likes_count() is
  'Holder forum_posts.likes_count lik antall rader i post_likes. SECURITY DEFINER av samme grunn som update_post_comment_count (migrasjon 076).';

-- ── 3: triggerne ───────────────────────────────────────────────────────────
-- Kommentartriggeren fra 001 fanget bare INSERT og DELETE. Begge opprettes på
-- nytt, så fila gir samme resultat enten 041 er kjørt eller ikke.

drop trigger if exists comments_count_trigger on public.comments;
create trigger comments_count_trigger
  after insert or update or delete on public.comments
  for each row execute function public.update_post_comment_count();

drop trigger if exists post_likes_count_trigger on public.post_likes;
create trigger post_likes_count_trigger
  after insert or delete on public.post_likes
  for each row execute function public.update_post_likes_count();

-- ── 4: en kommentar kan bare endres i teksten ──────────────────────────────
-- Tabellrettighetene gir anon og authenticated UPDATE på alle kolonner i
-- comments, og UPDATE-policyen sjekker bare hvem som eier raden. Appen endrer
-- aldri annet enn content (src/lib/hooks/useForum.ts); moderasjonen skriver
-- is_hidden med tjenesterollen, som ikke røres her. REVOKE først: en
-- kolonnerettighet oppå en tabellrettighet endrer ingenting (som i 074).
-- Et ekstra lag — vernet for tallene er flyttegrenen i del 1.

revoke update on public.comments from anon, authenticated;
grant update (content) on public.comments to authenticated;

-- ── 5: regn om tallene som har drevet ──────────────────────────────────────
-- Synlige kommentarer etter samme regel som triggeren (is_hidden NULL teller
-- som synlig), og alle likes. Innleggets egen skjuling spiller ingen rolle
-- her, heller ikke i triggeren.

update public.forum_posts as p
   set comments_count = fasit.synlige_kommentarer,
       likes_count    = fasit.likes
  from (
    select fp.id,
           (select count(*)
              from public.comments as c
             where c.post_id = fp.id
               and coalesce(c.is_hidden, false) = false) as synlige_kommentarer,
           (select count(*)
              from public.post_likes as l
             where l.post_id = fp.id) as likes
      from public.forum_posts as fp
  ) as fasit
 where p.id = fasit.id
   and (p.comments_count is distinct from fasit.synlige_kommentarer
        or p.likes_count is distinct from fasit.likes);

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- Alle tre leser bare. Raden 076 i hovedbokas spørring
-- (docs/migrasjoner-a-kjore.md) svarer på de to første i ett. Den tredje ser
-- hovedboka ikke etter: kolonnerettighetene er et ekstra lag, ikke vernet
-- (punkt 4 i filhodet).
--
-- 1) Skal gi to rader, begge med kjorer_som_eier = true og
--    {"search_path=public, pg_temp"} i siste kolonne:
--
-- select proname, prosecdef as kjorer_som_eier, proconfig
--   from pg_proc
--  where oid in (to_regproc('public.update_post_comment_count'),
--                to_regproc('public.update_post_likes_count'));
--
-- 2) Skal gi 0 rader: hvert innlegg har like mange kommentarer som det har
--    synlige kommentarer, og like mange likes som det har rader i post_likes.
--
-- select fp.id, fp.comments_count, fp.likes_count
--   from public.forum_posts as fp
--  where fp.comments_count is distinct from
--          (select count(*) from public.comments as c
--            where c.post_id = fp.id and coalesce(c.is_hidden, false) = false)
--     or fp.likes_count is distinct from
--          (select count(*) from public.post_likes as l where l.post_id = fp.id);
--
-- 3) Skal gi false og true: en innlogget kan ikke flytte en kommentar, men
--    kan rette teksten i den.
--
-- select has_column_privilege('authenticated', 'public.comments', 'post_id', 'UPDATE') as kan_flytte_kommentar,
--        has_column_privilege('authenticated', 'public.comments', 'content', 'UPDATE') as kan_rette_teksten;
