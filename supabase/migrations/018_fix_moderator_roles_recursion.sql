-- ============================================
-- Migration 018: Fix infinite recursion in moderator_roles RLS (Postgres 42P17)
-- ============================================
--
-- BUG: migration 002 defined the moderator_roles policies so their USING clause
-- does `EXISTS (SELECT 1 FROM moderator_roles ...)` — i.e. reading moderator_roles
-- re-evaluates the very policy that guards moderator_roles. Postgres detects the
-- loop and aborts the whole statement with:
--   42P17  "infinite recursion detected in policy for relation moderator_roles"
--
-- This breaks EVERY query that touches moderator_roles, directly or via an embed:
--   - the forum feed (it embeds each author's verified_foragers badge, and
--     verified_foragers' "Moderators manage" policy subqueries moderator_roles)
--   - reports moderation, findings moderator access, the audit-log embed, etc.
-- Net effect: the forum has been returning 500 in the browser.
--
-- FIX: check the caller's role through SECURITY DEFINER helper functions. A
-- definer function runs as its owner (the table owner), which is not subject to
-- moderator_roles' RLS — so the recursive loop is broken while the semantics
-- ("a user sees their own row; moderators see all; admins manage") are kept.
-- Idempotent: CREATE OR REPLACE + DROP POLICY IF EXISTS.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_moderator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moderator_roles
    WHERE user_id = auth.uid() AND role IN ('moderator', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.moderator_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_moderator() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;

-- Rewrite the two self-referential moderator_roles policies to call the helpers
-- instead of subquerying the table inside its own policy.
DROP POLICY IF EXISTS "Moderators can read roles" ON moderator_roles;
CREATE POLICY "Moderators can read roles" ON moderator_roles
  FOR SELECT USING (
    auth.uid() = user_id OR public.is_moderator()
  );

DROP POLICY IF EXISTS "Admins manage moderator roles" ON moderator_roles;
CREATE POLICY "Admins manage moderator roles" ON moderator_roles
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMIT;

-- Note: the other policies that subquery moderator_roles (reports, verified_foragers,
-- findings via migration 015, audit via 008) now work as-is, because moderator_roles'
-- own policy is no longer recursive. They could later be simplified to call
-- public.is_moderator() / public.is_admin() too, but that is optional cleanup.
