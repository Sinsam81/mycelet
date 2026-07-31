-- 032: blokkering av brukere + innholdsfilter før publisering.
--
-- Bakgrunn: Apples retningslinje 1.2 krever fire ting av apper med
-- brukergenerert innhold. Vi hadde to av dem (rapportering, og moderatorverktøy).
-- Denne migrasjonen leverer de to andre på databasenivå:
--   • mulighet for å blokkere en annen bruker
--   • en metode for å filtrere ut åpenbart uakseptabelt innhold
--
-- Filtreringen og blokkeringen ligger i databasen, ikke bare i klienten. Det
-- betyr at de virker i hver eneste spørring appen gjør — også i spørringer som
-- skrives senere og glemmer å filtrere — og at de ikke kan omgås ved å snakke
-- direkte med API-et.

begin;

-- ── Del 1: blokkering ──────────────────────────────────────────────────────

create table if not exists blocked_users (
  blocker_id uuid references profiles(id) on delete cascade not null,
  blocked_id uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (blocker_id, blocked_id),
  -- Ingen kan blokkere seg selv.
  constraint blocked_users_not_self check (blocker_id <> blocked_id)
);

comment on table blocked_users is
  'Per-bruker blokkering. Skjuler den blokkerte brukerens innlegg og kommentarer for den som blokkerte, via RLS-policyene på forum_posts og comments. Apple App Review 1.2.';

-- Oppslaget «hvem har A blokkert» går på primærnøkkelen. Denne indeksen dekker
-- motsatt retning, som RLS-subspørringen under bruker.
create index if not exists blocked_users_blocked_idx on blocked_users (blocked_id);

alter table blocked_users enable row level security;

-- Du ser, oppretter og fjerner bare dine egne blokkeringer. Ingen kan se at de
-- er blokkert av noen — det er bevisst, og det er derfor policyen bare treffer
-- blocker_id.
drop policy if exists "Egne blokkeringer er synlige" on blocked_users;
create policy "Egne blokkeringer er synlige" on blocked_users
  for select using (auth.uid() = blocker_id);

drop policy if exists "Innloggede kan blokkere" on blocked_users;
create policy "Innloggede kan blokkere" on blocked_users
  for insert with check (auth.uid() = blocker_id);

drop policy if exists "Brukere kan oppheve egne blokkeringer" on blocked_users;
create policy "Brukere kan oppheve egne blokkeringer" on blocked_users
  for delete using (auth.uid() = blocker_id);

grant select, insert, delete on blocked_users to authenticated;

-- ── Del 2: skjul blokkerte brukeres innhold, i RLS ─────────────────────────
--
-- Policyene fra 001 het «Innlegg er synlige for alle» og «Kommentarer er
-- synlige for alle», og gjorde bare `is_hidden = false`. De erstattes med en
-- variant som også utelater forfattere den innloggede har blokkert.
--
-- For utloggede lesere er auth.uid() NULL, subspørringen finner ingenting, og
-- filteret er en no-op — offentlig lesing av forumet er uendret.

drop policy if exists "Innlegg er synlige for alle" on forum_posts;
create policy "Innlegg er synlige for alle" on forum_posts
  for select using (
    is_hidden = false
    and not exists (
      select 1 from blocked_users b
      where b.blocker_id = auth.uid()
        and b.blocked_id = forum_posts.user_id
    )
  );

drop policy if exists "Kommentarer er synlige for alle" on comments;
create policy "Kommentarer er synlige for alle" on comments
  for select using (
    is_hidden = false
    and not exists (
      select 1 from blocked_users b
      where b.blocker_id = auth.uid()
        and b.blocked_id = comments.user_id
    )
  );

-- ── Del 3: innholdsfilter før publisering ──────────────────────────────────
--
-- Vilkårene punkt 5 forbyr å dele voksesteder for, dyrke, skaffe, tilby eller
-- selge narkotiske sopper. Dette avviser de utvetydige tilfellene ved innsending.
--
-- Bevisst avgrenset: teksten må inneholde BÅDE et stoffnavn OG et ord som viser
-- omsetning, dyrking eller stedsdeling. En ren advarsel som «fleinsopp er
-- ulovlig i Norge» slipper altså gjennom — vi vil ikke hindre at folk snakker om
-- at det er forbudt. Målet er tilbud og etterspørsel, ikke ordet i seg selv.
--
-- Bruker to_jsonb(new) framfor new.title, siden comments ikke har en title-
-- kolonne og samme funksjon skal betjene begge tabellene.

create or replace function public.reject_prohibited_content()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  txt text;
  substance text := '(fleinsopp|psilocyb|psilocin|magic\s?mushroom|liberty\s?cap|toppsl(a|ä)tskivling|semilanceata|cubensis)';
  intent text := '(selg|selger|kj(o|ø)p|k(o|ö)p|s(a|ä)lj|byttes?|byta|dyrk|odla|spore?spr(o|ø)yte|spore\s?syringe|sporer til salgs|voksested|v(a|ä)xtplats|koordinat|dm\s?(meg|mig)|send(er|es)?\s+(til|mot))';
begin
  txt := lower(
    coalesce(to_jsonb(new) ->> 'title', '') || ' ' || coalesce(to_jsonb(new) ->> 'content', '')
  );

  if txt ~ substance and txt ~ intent then
    raise exception 'MYCELET_PROHIBITED_CONTENT'
      using hint = 'Innhold om omsetning, dyrking eller voksesteder for narkotiske sopper er ikke tillatt. Se vilkårene punkt 5.';
  end if;

  return new;
end
$$;

drop trigger if exists forum_posts_content_filter on forum_posts;
create trigger forum_posts_content_filter
  before insert or update of title, content on forum_posts
  for each row execute function public.reject_prohibited_content();

drop trigger if exists comments_content_filter on comments;
create trigger comments_content_filter
  before insert or update of content on comments
  for each row execute function public.reject_prohibited_content();

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- 1) Filteret skal SLIPPE GJENNOM en ren advarsel (skal returnere false):
-- select lower('Husk at fleinsopp er ulovlig i Norge') ~
--   '(selg|selger|kj(o|ø)p|k(o|ö)p|s(a|ä)lj|byttes?|byta|dyrk|odla|spore?spr(o|ø)yte|spore\s?syringe|sporer til salgs|voksested|v(a|ä)xtplats|koordinat|dm\s?(meg|mig)|send(er|es)?\s+(til|mot))' as skal_vaere_false;
--
-- 2) …og STOPPE et tilbud (skal returnere true):
-- select lower('selger fleinsopp, dm meg') ~
--   '(selg|selger|kj(o|ø)p|k(o|ö)p|s(a|ä)lj|byttes?|byta|dyrk|odla|spore?spr(o|ø)yte|spore\s?syringe|sporer til salgs|voksested|v(a|ä)xtplats|koordinat|dm\s?(meg|mig)|send(er|es)?\s+(til|mot))' as skal_vaere_true;
--
-- 3) Blokkeringstabellen skal finnes med tre policyer:
-- select policyname from pg_policies where tablename = 'blocked_users';
