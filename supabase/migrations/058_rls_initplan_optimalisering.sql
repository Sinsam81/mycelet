-- ============================================
-- Migration 057: RLS-ytelse — auth.uid()/auth.role() som init-plan
-- ============================================
--
-- Supabase Advisor flagger «Auth RLS Initialization Plan» (auth_rls_initplan)
-- på tabellene våre: policyer som kaller auth.uid() eller auth.role() DIREKTE
-- får funksjonen re-evaluert for hver rad spørringen berører. Pakkes kallet
-- inn som skalar-subspørring — (select auth.uid()) — evaluerer Postgres den
-- ÉN gang per spørring (InitPlan) og gjenbruker verdien.
--
-- INGEN SEMANTISK ENDRING. Hver policy under er en ordrett kopi av den
-- gjeldende definisjonen (001/002/003/004/006/007/008/011/015/018/019/021/
-- 022/032/051/055), kun med auth.uid()/auth.role() byttet til
-- (select auth.uid())/(select auth.role()). Policyer uten direkte auth.*-kall
-- (f.eks. «Profiler er synlige for alle», «Admins manage moderator roles» som
-- kun kaller public.is_admin()) er ikke flagget og røres ikke.
--
-- public_findings-viewet og SECURITY DEFINER-funksjonene røres IKKE — de er
-- bevisst design (personvern-porten, jf. 015/018/043).
--
-- DROP + CREATE skjer i én transaksjon, så det finnes ikke noe vindu der en
-- tabell står uten policy. Idempotent: trygt å lime inn på nytt.
--
-- Kjøres manuelt i Supabase SQL Editor.

BEGIN;

-- ── profiles (001) ───────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Brukere kan oppdatere egen profil" ON profiles;
CREATE POLICY "Brukere kan oppdatere egen profil" ON profiles
  FOR UPDATE USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Brukere kan opprette egen profil" ON profiles;
CREATE POLICY "Brukere kan opprette egen profil" ON profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = id);

-- ── findings (001 + 015) ─────────────────────────────────────────────────────
-- SELECT-policyen er 015-varianten (kun eieren leser tabellen direkte;
-- offentlig lesing går via public_findings-viewet).
DROP POLICY IF EXISTS "Brukere kan lese egne funn" ON findings;
CREATE POLICY "Brukere kan lese egne funn" ON findings
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan opprette egne funn" ON findings;
CREATE POLICY "Brukere kan opprette egne funn" ON findings
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan oppdatere egne funn" ON findings;
CREATE POLICY "Brukere kan oppdatere egne funn" ON findings
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan slette egne funn" ON findings;
CREATE POLICY "Brukere kan slette egne funn" ON findings
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── forum_posts (001 + 032) ──────────────────────────────────────────────────
-- SELECT-policyen er 032-varianten (skjuler blokkerte forfattere).
DROP POLICY IF EXISTS "Innlegg er synlige for alle" ON forum_posts;
CREATE POLICY "Innlegg er synlige for alle" ON forum_posts
  FOR SELECT USING (
    is_hidden = false
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE b.blocker_id = (select auth.uid())
        AND b.blocked_id = forum_posts.user_id
    )
  );

DROP POLICY IF EXISTS "Innloggede kan opprette innlegg" ON forum_posts;
CREATE POLICY "Innloggede kan opprette innlegg" ON forum_posts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan redigere egne innlegg" ON forum_posts;
CREATE POLICY "Brukere kan redigere egne innlegg" ON forum_posts
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan slette egne innlegg" ON forum_posts;
CREATE POLICY "Brukere kan slette egne innlegg" ON forum_posts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── comments (001 + 032) ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Kommentarer er synlige for alle" ON comments;
CREATE POLICY "Kommentarer er synlige for alle" ON comments
  FOR SELECT USING (
    is_hidden = false
    AND NOT EXISTS (
      SELECT 1 FROM blocked_users b
      WHERE b.blocker_id = (select auth.uid())
        AND b.blocked_id = comments.user_id
    )
  );

DROP POLICY IF EXISTS "Innloggede kan kommentere" ON comments;
CREATE POLICY "Innloggede kan kommentere" ON comments
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan redigere egne kommentarer" ON comments;
CREATE POLICY "Brukere kan redigere egne kommentarer" ON comments
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan slette egne kommentarer" ON comments;
CREATE POLICY "Brukere kan slette egne kommentarer" ON comments
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── post_likes (001) ─────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Innloggede kan like" ON post_likes;
CREATE POLICY "Innloggede kan like" ON post_likes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan fjerne egne likes" ON post_likes;
CREATE POLICY "Brukere kan fjerne egne likes" ON post_likes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── comment_likes (001) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Innloggede kan like kommentarer" ON comment_likes;
CREATE POLICY "Innloggede kan like kommentarer" ON comment_likes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Brukere kan fjerne comment likes" ON comment_likes;
CREATE POLICY "Brukere kan fjerne comment likes" ON comment_likes
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── saved_posts (001) ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Kun egne lagrede" ON saved_posts;
CREATE POLICY "Kun egne lagrede" ON saved_posts
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Kan lagre innlegg" ON saved_posts;
CREATE POLICY "Kan lagre innlegg" ON saved_posts
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Kan fjerne lagrede" ON saved_posts;
CREATE POLICY "Kan fjerne lagrede" ON saved_posts
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── reports (001 + 002) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Kun egne rapporter" ON reports;
CREATE POLICY "Kun egne rapporter" ON reports
  FOR SELECT USING ((select auth.uid()) = reporter_id);

DROP POLICY IF EXISTS "Innloggede kan rapportere" ON reports;
CREATE POLICY "Innloggede kan rapportere" ON reports
  FOR INSERT WITH CHECK ((select auth.uid()) = reporter_id);

DROP POLICY IF EXISTS "Moderators can read all reports" ON reports;
CREATE POLICY "Moderators can read all reports" ON reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = (select auth.uid()) AND mr.role IN ('moderator', 'admin')
    )
  );

DROP POLICY IF EXISTS "Moderators can update report status" ON reports;
CREATE POLICY "Moderators can update report status" ON reports
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = (select auth.uid()) AND mr.role IN ('moderator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM moderator_roles mr
      WHERE mr.user_id = (select auth.uid()) AND mr.role IN ('moderator', 'admin')
    )
  );

-- ── moderator_roles (018) ────────────────────────────────────────────────────
-- «Admins manage moderator roles» kaller kun public.is_admin() (SECURITY
-- DEFINER, jf. 018) og er ikke flagget — den røres ikke.
DROP POLICY IF EXISTS "Moderators can read roles" ON moderator_roles;
CREATE POLICY "Moderators can read roles" ON moderator_roles
  FOR SELECT USING (
    (select auth.uid()) = user_id OR public.is_moderator()
  );

-- ── billing_subscriptions (004) ──────────────────────────────────────────────
DROP POLICY IF EXISTS "Users can read own billing subscription" ON billing_subscriptions;
CREATE POLICY "Users can read own billing subscription" ON billing_subscriptions
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Service role manages billing subscriptions" ON billing_subscriptions;
CREATE POLICY "Service role manages billing subscriptions" ON billing_subscriptions
  FOR ALL USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ── verified_foragers (006) ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages verified foragers" ON verified_foragers;
CREATE POLICY "Service role manages verified foragers" ON verified_foragers
  FOR ALL USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

DROP POLICY IF EXISTS "Moderators manage verified foragers" ON verified_foragers;
CREATE POLICY "Moderators manage verified foragers" ON verified_foragers
  FOR ALL USING (
    EXISTS (
      SELECT 1
      FROM moderator_roles mr
      WHERE mr.user_id = (select auth.uid()) AND mr.role IN ('moderator', 'admin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM moderator_roles mr
      WHERE mr.user_id = (select auth.uid()) AND mr.role IN ('moderator', 'admin')
    )
  );

-- ── billing_webhook_events (007) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages billing webhook events" ON billing_webhook_events;
CREATE POLICY "Service role manages billing webhook events" ON billing_webhook_events
  FOR ALL USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ── admin_audit_log (008) ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Moderators can read audit log" ON admin_audit_log;
CREATE POLICY "Moderators can read audit log" ON admin_audit_log
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM moderator_roles
      WHERE user_id = (select auth.uid())
        AND role IN ('admin', 'moderator')
    )
  );

-- ── account_deletion_warnings (011) ──────────────────────────────────────────
DROP POLICY IF EXISTS "Users read own deletion warning" ON account_deletion_warnings;
CREATE POLICY "Users read own deletion warning" ON account_deletion_warnings
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can clear own deletion warning" ON account_deletion_warnings;
CREATE POLICY "Users can clear own deletion warning" ON account_deletion_warnings
  FOR DELETE USING ((select auth.uid()) = user_id);

-- ── prediction_tiles (003 + 015) ─────────────────────────────────────────────
DROP POLICY IF EXISTS "Moderatorer kan lese prediction tiles" ON prediction_tiles;
CREATE POLICY "Moderatorer kan lese prediction tiles" ON prediction_tiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM moderator_roles mr WHERE mr.user_id = (select auth.uid()))
  );

DROP POLICY IF EXISTS "Kun service role kan skrive prediction tiles" ON prediction_tiles;
CREATE POLICY "Kun service role kan skrive prediction tiles" ON prediction_tiles
  FOR ALL USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ── spot_feedback (021) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Users insert own spot feedback" ON spot_feedback;
CREATE POLICY "Users insert own spot feedback"
  ON spot_feedback FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users read own spot feedback" ON spot_feedback;
CREATE POLICY "Users read own spot feedback"
  ON spot_feedback FOR SELECT
  USING ((select auth.uid()) = user_id);

-- ── occurrence_weather_features (022) ────────────────────────────────────────
DROP POLICY IF EXISTS "Service role manages occurrence weather features" ON occurrence_weather_features;
CREATE POLICY "Service role manages occurrence weather features"
  ON occurrence_weather_features
  FOR ALL
  USING ((select auth.role()) = 'service_role')
  WITH CHECK ((select auth.role()) = 'service_role');

-- ── blocked_users (032) ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Egne blokkeringer er synlige" ON blocked_users;
CREATE POLICY "Egne blokkeringer er synlige" ON blocked_users
  FOR SELECT USING ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "Innloggede kan blokkere" ON blocked_users;
CREATE POLICY "Innloggede kan blokkere" ON blocked_users
  FOR INSERT WITH CHECK ((select auth.uid()) = blocker_id);

DROP POLICY IF EXISTS "Brukere kan oppheve egne blokkeringer" ON blocked_users;
CREATE POLICY "Brukere kan oppheve egne blokkeringer" ON blocked_users
  FOR DELETE USING ((select auth.uid()) = blocker_id);

-- ── alert_subscriptions (051) ────────────────────────────────────────────────
DROP POLICY IF EXISTS "Egne varselabonnement er synlige for eieren" ON alert_subscriptions;
CREATE POLICY "Egne varselabonnement er synlige for eieren"
  ON alert_subscriptions FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Egne varselabonnement kan opprettes av eieren" ON alert_subscriptions;
CREATE POLICY "Egne varselabonnement kan opprettes av eieren"
  ON alert_subscriptions FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Egne varselabonnement kan endres av eieren" ON alert_subscriptions;
CREATE POLICY "Egne varselabonnement kan endres av eieren"
  ON alert_subscriptions FOR UPDATE
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Egne varselabonnement kan slettes av eieren" ON alert_subscriptions;
CREATE POLICY "Egne varselabonnement kan slettes av eieren"
  ON alert_subscriptions FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ── identifications (055_identification_history) ─────────────────────────────
DROP POLICY IF EXISTS "Users read own identifications" ON identifications;
CREATE POLICY "Users read own identifications" ON identifications
  FOR SELECT TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own identifications" ON identifications;
CREATE POLICY "Users insert own identifications" ON identifications
  FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users update own identifications" ON identifications;
CREATE POLICY "Users update own identifications" ON identifications
  FOR UPDATE TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users delete own identifications" ON identifications;
CREATE POLICY "Users delete own identifications" ON identifications
  FOR DELETE TO authenticated
  USING ((select auth.uid()) = user_id);

-- ── storage.objects (019 + 055) ──────────────────────────────────────────────
-- Advisor flagger de samme policy-mønstrene på storage.objects. Samme
-- omskriving; «Public read mycelet images» har ingen auth.*-kall og røres ikke.
DROP POLICY IF EXISTS "Authenticated upload own mycelet images" ON storage.objects;
CREATE POLICY "Authenticated upload own mycelet images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('forum-images', 'finding-images')
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Owners update own mycelet images" ON storage.objects;
CREATE POLICY "Owners update own mycelet images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('forum-images', 'finding-images') AND owner = (select auth.uid()))
  WITH CHECK (bucket_id IN ('forum-images', 'finding-images') AND owner = (select auth.uid()));

DROP POLICY IF EXISTS "Owners delete own mycelet images" ON storage.objects;
CREATE POLICY "Owners delete own mycelet images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('forum-images', 'finding-images') AND owner = (select auth.uid()));

DROP POLICY IF EXISTS "Owners read own identify history images" ON storage.objects;
CREATE POLICY "Owners read own identify history images" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Owners upload own identify history images" ON storage.objects;
CREATE POLICY "Owners upload own identify history images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Owners update own identify history images" ON storage.objects;
CREATE POLICY "Owners update own identify history images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

DROP POLICY IF EXISTS "Owners delete own identify history images" ON storage.objects;
CREATE POLICY "Owners delete own identify history images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'identify-history'
    AND (storage.foldername(name))[1] = (select auth.uid())::text
  );

COMMIT;

-- ── Skjemadrift oppdaget under arbeidet: saved_places ────────────────────────
-- Databasen har en tabell `saved_places` (0 rader) som ikke finnes i noen
-- migrasjonsfil og ikke refereres noe sted i koden — trolig opprettet manuelt
-- i dashbordet tidlig i utviklingen og glemt. Det er den Advisor egentlig
-- flagget (ikke saved_posts). Den droppes IKKE av denne migrasjonen — å slette
-- tabeller skal være en aktiv beslutning, ikke en bivirkning av en
-- ytelsesopprydding. Når eieren er klar, er kommandoen:
--
--   drop table if exists saved_places;
--
-- (uten cascade med vilje: skulle noe mot formodning avhenge av den, skal det
-- feile høyt i stedet for å rives med i stillhet.)


-- Etterkontroll (kjør separat i SQL Editor): skal returnere 0 rader.
-- pg_policies gjengir en innpakket policy som «( SELECT auth.uid() AS uid)»,
-- så spørringen finner policyer der auth.uid()/auth.role() står med noe ANNET
-- enn SELECT rett foran seg — dvs. fortsatt evalueres per rad.
--
--   SELECT schemaname, tablename, policyname
--   FROM pg_policies
--   WHERE schemaname IN ('public', 'storage')
--     AND (
--       COALESCE(qual, '') || ' ' || COALESCE(with_check, '')
--         ~* '(?<!select )auth\.(uid|role)\(\)'
--     );
