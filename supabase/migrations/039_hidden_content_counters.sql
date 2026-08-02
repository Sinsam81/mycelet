-- 039: la tellerne slutte å telle innhold ingen får se.
--
-- ⚠️ IKKE KJØRT. Lim inn i Supabase SQL Editor når du vil ha den ute.
-- Idempotent: trygg å lime inn på nytt.
--
-- BAKGRUNN
-- To tellere teller ANNET enn listene rett under dem viser:
--
-- 1) get_user_stats (migrasjon 029) er SECURITY DEFINER og teller
--    `COUNT(*) FROM forum_posts WHERE user_id = ...`. Den omgår RLS og teller
--    dermed også skjulte innlegg. Profilsiden viser tallet som StatCard
--    «Innlegg» (src/app/profile/page.tsx), mens listen rett under hentes med
--    brukerens egen sesjon og filtreres av RLS-policyen fra migrasjon 032
--    (`is_hidden = false` + ikke fra en blokkert forfatter). Modererer du bort
--    ett innlegg, står det «4 innlegg» over en liste med tre.
--
-- 2) forum_posts.comments_count vedlikeholdes av triggeren
--    update_post_comment_count (migrasjon 001), som teller hver INSERT og hver
--    DELETE uten å bry seg om is_hidden. Skjuler en moderator én kommentar,
--    står det fortsatt «3 kommentarer» mens to vises. Verre: forum-filteret
--    «ubesvarte spørsmål» bruker `.eq('comments_count', 0)`
--    (src/lib/hooks/useForum.ts), så et spørsmål der alle svar er skjult
--    forsvinner fra ubesvart-listen selv om brukeren ser null svar — altså
--    nøyaktig det spørsmålet som trenger et svar.
--
-- Ingen av delene er synlige i dag fordi forumet er tomt. De slår inn første
-- gang noe modereres, og da på den vanskeligste måten: som et tall som ikke
-- stemmer med det brukeren ser.
--
-- MERK om likes: total_likes_received summerer likes_count over ALLE innlegg,
-- også skjulte. Det er bevisst uendret her — tallet er brukerens egen
-- anerkjennelse over tid, ikke et løfte om hva som ligger i en liste.

begin;

-- ── 1: la statistikken telle det leserne faktisk ser ───────────────────────
create or replace function get_user_stats(p_user_id uuid)
returns table(
  total_findings bigint,
  unique_species bigint,
  total_posts bigint,
  total_likes_received bigint
) as $$
begin
  return query
  select
    (select count(*) from findings
      where user_id = p_user_id and is_negative_observation = false),
    (select count(distinct species_id) from findings
      where user_id = p_user_id and species_id is not null and is_negative_observation = false),
    -- Ny: skjulte innlegg teller ikke, siden de heller ikke vises.
    (select count(*) from forum_posts
      where user_id = p_user_id and is_hidden = false),
    (select coalesce(sum(likes_count), 0) from forum_posts where user_id = p_user_id);
end;
$$ language plpgsql security definer set search_path = public;

-- ── 2: la kommentartelleren følge is_hidden ────────────────────────────────
-- Triggeren må reagere på tre ting: INSERT (av en synlig kommentar), DELETE
-- (av en synlig kommentar) og UPDATE der is_hidden endrer seg i én av
-- retningene. Uten UPDATE-grenen ville moderering aldri justere tallet.
create or replace function update_post_comment_count()
returns trigger as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(new.is_hidden, false) = false then
      update forum_posts set comments_count = comments_count + 1 where id = new.post_id;
    end if;
  elsif tg_op = 'DELETE' then
    if coalesce(old.is_hidden, false) = false then
      update forum_posts set comments_count = greatest(comments_count - 1, 0) where id = old.post_id;
    end if;
  elsif tg_op = 'UPDATE' then
    if coalesce(old.is_hidden, false) = false and coalesce(new.is_hidden, false) = true then
      update forum_posts set comments_count = greatest(comments_count - 1, 0) where id = new.post_id;
    elsif coalesce(old.is_hidden, false) = true and coalesce(new.is_hidden, false) = false then
      update forum_posts set comments_count = comments_count + 1 where id = new.post_id;
    end if;
  end if;
  return coalesce(new, old);
end;
$$ language plpgsql;

-- Triggeren fra 001 fanget bare INSERT og DELETE. Erstatt den.
drop trigger if exists comments_count_trigger on comments;
create trigger comments_count_trigger
  after insert or update or delete on comments
  for each row execute function update_post_comment_count();

-- ── 3: rett opp tellere som allerede har drevet fra hverandre ─────────────
update forum_posts p
set comments_count = sub.visible
from (
  select fp.id, count(c.id) filter (where coalesce(c.is_hidden, false) = false) as visible
  from forum_posts fp
  left join comments c on c.post_id = fp.id
  group by fp.id
) sub
where p.id = sub.id
  and p.comments_count is distinct from sub.visible;

commit;

-- ── Kontroll etter kjøring ─────────────────────────────────────────────────
-- 1) Ingen rader skal komme ut her — telleren skal være lik antall SYNLIGE
--    kommentarer for hvert innlegg:
--
-- select fp.id, fp.comments_count,
--        count(c.id) filter (where coalesce(c.is_hidden, false) = false) as synlige
-- from forum_posts fp
-- left join comments c on c.post_id = fp.id
-- group by fp.id, fp.comments_count
-- having fp.comments_count is distinct from
--        count(c.id) filter (where coalesce(c.is_hidden, false) = false);
--
-- 2) Og statistikken skal stemme med det RLS slipper gjennom:
--
-- select (get_user_stats('<en-bruker-uuid>')).total_posts as fra_statistikk,
--        (select count(*) from forum_posts
--          where user_id = '<en-bruker-uuid>' and is_hidden = false) as synlige;
