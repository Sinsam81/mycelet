# Codex Task Brief — Autonomous review & improvement of Mycelet

> **Who you are:** an autonomous senior engineer taking over **Mycelet**, a *live* Norwegian/Swedish mushroom-foraging app (Next.js 16 + Supabase + Stripe + Leaflet, hosted on Vercel, real paying customers).
>
> **Who you are working for:** the solo, non-technical founder. **He is traveling and unreachable. He cannot and will not approve anything while you work.** Do not ask him questions and do not wait for approval. When you hit a decision, choose the most reasonable option, implement it, and record the decision + rationale + alternatives in a report so he can reverse it later. Be thorough, be decisive, be safe.

---

## 0. Read first (your ground truth)

Before touching anything, read, in order:
1. **`docs/CODEX-HANDOVER.md`** — the complete technical handover (architecture, data model, API, AI/prediction logic, security, do-not-touch list, known bugs, launch gaps). This is your primary reference.
2. **`CLAUDE.md`** — conventions + gotchas. Note: the handover §14 lists where CLAUDE.md is stale — trust the code and the handover over CLAUDE.md.
3. The docs the handover points to as needed: `docs/roadmap.md`, `docs/qa-sjekkliste.md`, `docs/prediction-validation-runbook.md`, `docs/retention-policy.md`.

Then build a mental model by actually running the app (`npm run dev`) and clicking through every page in **both regions (Norway and Sweden)** and **both tiers (free and paid behavior)**.

---

## 1. Your mission (four workstreams)

Deliver real, verified improvements in these four areas. The founder's stated priorities are, in order of pain:

### A. UX overhaul — the map is the #1 complaint
The founder finds the **map cluttered and messy**. `src/components/map/MushroomMap.tsx` is a single ~1625-line client component holding every map concern (3 basemaps, find clusters, GBIF occurrences, prediction hotspots, "promising spots" pins, species-photo markers, filters, panels, offline save, GPS). Your job:
- Actually look at it running (desktop **and** mobile viewport — this is a phone-first app used outdoors).
- Enumerate the clutter concretely: overlapping panels, too many always-on layers/controls, unclear affordances, competing calls-to-action, cramped mobile layout.
- Design and implement a **cleaner information architecture**: sensible layer toggles, progressive disclosure (hide advanced/premium tools until asked), a decluttered control set, clear visual hierarchy, thumb-reachable controls on mobile. Reduce cognitive load without removing capability.
- Improve UX across the rest of the app too (identify flow, onboarding, forms, navigation), but the **map is the priority**.

### B. Bug hunt — fix real bugs across the whole app
Systematically find and fix bugs:
- Run `npm run typecheck`, `npm run test`, `npm run build` and fix everything they surface.
- Check the browser console for errors/warnings on every page, in both regions, both tiers, logged-in and out.
- Exercise: identify flow, prediction, map load + pan + all layers, offline caching, geolocation, calendar, species catalog, auth (login/register/forgot/reset), billing gating (web), forms (add finding with each visibility mode).
- Watch for the recurring **Norway-centric-assumption bug class** (blank Swedish map/offline, region mis-routing) — verify the recent fixes (commit `4f51dbb`, offline map / region routing) did not regress and hunt for siblings.
- Keep a bug ledger (see deliverables). Fix what you can; flag what needs the founder.

### C. Core-feature improvement pass
For each core feature — **identify, prediction, map, calendar, species, forum (currently behind `FLAGS.forumInNav`)** — ask: *"What would make this materially better without over-scoping?"* Prioritize by value ÷ effort. Implement the high-value, low-regret wins. Write up the bigger ideas as proposals instead of building them. Respect the prediction-honesty rule (§3): improve the *when* (phenology/flush) experience; do not over-promise the *where*.

### D. Launch-readiness checklist
Produce a concrete, ordered list of everything that remains before a confident public/App Store launch — drawn from handover §5/§13/§16 **plus your own findings**. Tag each item **[code — done/doable by you]** or **[founder action — needs a human]** (e.g. API keys, DPAs, App Store account steps, lawyer review).

---

## 2. How you must operate (autonomy + verification)

- **Full engineering autonomy.** You may read anything, refactor, fix, add tests, restructure components, and make judgment calls without asking. Document non-obvious decisions in your reports.
- **Verify every change before calling it done.** A change is not finished until `npm run typecheck && npm run test && npm run build` all pass. Add or update unit tests (Vitest, in `__tests__/` next to source) for logic you change. Run `npm run qa` (Playwright, local) where it helps — but see the read-only rule below.
- **Small, themed commits and PRs.** Work on branches. One theme per branch/PR — **never bundle** a map refactor with a billing fix. Each PR must have a clear description: what, why, how verified, risk. Use `gh` to open PRs against `main`.
- **Keep UI copy Norwegian/Swedish** via `next-intl`. Any new user-facing string goes in **both** `messages/nb.json` and `messages/sv.json` (keep them in sync). No hardcoded English UI strings.
- **Leave the codebase greener than you found it**, but no gratuitous churn or giant rewrites. Explicitly **defer** the MapLibre/vector-tiles migration (handover §16 P3) — declutter the existing Leaflet map instead.

---

## 3. Hard boundaries — the only things reserved for the founder

You have authority over all *code*, **including deploying it to production** — but under a strict protocol, because this is a live app with real paying customers and **one Supabase project (no staging)**, where **merging to `main` auto-deploys to production on Vercel** within ~1–2 minutes.

1. **Deployment protocol (auto-deploy allowed, with a safety net).** You MAY merge your own PRs to `main` and let them deploy to production — but ONLY under ALL of these rules:
   - **Verify first:** never merge a PR unless `npm run typecheck && npm run test && npm run build` all pass on it.
   - **One at a time:** merge and deploy a single PR, then fully verify production before merging the next. Never batch several changes into one deploy — keep the blast radius to one change.
   - **Sequence by risk:** ship the safe, isolated fixes first; save the largest/riskiest change (e.g. a big map refactor) for last, after the safe ones are proven live.
   - **Verify production after each deploy:** wait ~2 minutes for Vercel to build + propagate, then confirm `https://www.mycelet.com/api/health` returns `status: ok` (HTTP 200) and run the read-only prod smoke `npm run qa:prod`. If your change touched a specific asset/route, fetch it to confirm the new version is actually live.
   - **Roll back on ANY failure:** if the health check or smoke fails, errors spike, or anything looks wrong after a deploy, immediately **`git revert` the merge commit and push to `main`** — this redeploys the last known-good state. (Do this via git; do not rely on a Vercel dashboard you may not have access to.) Then record it in the bug ledger and move on — do not blindly re-deploy the same broken change.
   - **Log every deploy** in `docs/reports/deploys.md`: what shipped, the commit SHA, the health/smoke result, and any rollback.
2. **Do NOT apply database migrations to the live Supabase — this stays reserved for the founder.** Schema changes are the one truly irreversible action (no staging, no backup database — a bad migration can destroy real customer data). If a change needs schema work, write the new numbered migration file (`supabase/migrations/029_*.sql`, `030_*`, …) but **do not run it**, and **do not deploy code that depends on it** until it's applied. List it in the launch checklist as a founder action. Never edit an already-applied migration (001–028).
3. **Keep all authed/e2e tests read-only.** Writes hit the production database. Do not create real findings, forum posts, purchases, or emails against prod.
4. **Do NOT touch secrets, spend money, send emails, make real Stripe charges, or call external APIs in a way that affects real users/data.**
5. **Respect the do-not-touch list (handover §14):** coordinate-masking system (trigger + `public_findings` view + RLS), the AI identify safety invariants, `getRegion`, the single `computeCellPrediction` scoring path, the append-only audit log, `billing_subscriptions` as the one entitlement source, and the enforcing CSP/security headers. If you are convinced one of these *should* change, **write a proposal with rationale** — do not just change it.
6. **Never commit iCloud `"* 2.*"` duplicate files** (delete them before building; see handover §5).

Do all the engineering and ship it under the protocol above. The safety net (verify → one-at-a-time → health-check → revert-on-failure) is what lets you deploy to a staging-less app responsibly. Anything genuinely blocked on the founder (DB migrations, secrets, business/legal calls) goes in a **"needs founder"** list — it does not stop your other work.

---

## 4. Method notes (so you don't thrash)

- **Preserve safety-critical behavior:** AI is never an edibility verdict (acknowledgement gate, unknown-edibility-treated-as-dangerous, critical look-alikes always surfaced, poisonous suggestions never buried). Do not weaken any of this while improving UX.
- **Prediction honesty:** the validated signal is temporal (timing AUC ~0.89); the spatial "where" signal is near chance (~0.52). Market/UX the *when*; don't add UI that over-claims *where*.
- **Two hardcoded couplings move together:** the tile templates in `src/lib/utils/offlineMap.ts` ↔ `isMapTileRequest` in `public/sw.js` ↔ the map's base-layer construction. Change them as a set.
- **Feature flags:** forum + trip-mode are live-but-hidden (`src/lib/flags.ts`). Don't assume flagged-off code is dead.
- **Prioritize ruthlessly.** Only propose or implement what is genuinely worth it. Skip cosmetic bikeshedding. For every change ask: does this reduce a real bug, a real UX pain, or a real launch blocker? If not, drop it.

---

## 5. Deliverables (write these as files + PRs)

Create a `docs/reports/` folder and write:

1. **`docs/reports/README.md`** — a 5-minute executive summary the founder reads first on return: what you changed **and deployed live**, what was rolled back and why, what's still pending, and what needs his decision/action. (Plus `docs/reports/deploys.md`, the deploy log from §3.)
2. **`docs/reports/ux-audit.md`** — map + app UX findings, each with the concrete problem, what you changed (or propose), and before/after notes. Screenshots/GIFs if you can produce them.
3. **`docs/reports/bug-ledger.md`** — every bug found: description, how to reproduce, severity, root cause, and status (fixed in PR #, or needs-founder + why).
4. **`docs/reports/core-improvements.md`** — core-feature improvements, prioritized (value ÷ effort), marked implemented vs proposed.
5. **`docs/reports/launch-checklist.md`** — the ordered launch list, each item tagged **[code — done/doable]** or **[founder action]**, with enough detail to act on.
6. **A set of self-contained, verified PRs**, one theme each, each with a clear description and a green `typecheck + test + build`.

Record any decision where you picked one option over another (with the alternatives) so the founder can reverse it.

---

## 6. Definition of done

- Every PR is verified green (`typecheck` + `test` + `build`) and scoped to one theme.
- Code changes are **deployed to production under the §3 protocol** (verified → one-at-a-time → health-checked → rolled back on failure) and logged in `docs/reports/deploys.md`. Production is healthy (`/api/health` = ok) at the end.
- **No database migration has been applied to production** — those are written and left for the founder.
- The reports are concrete and honest (say what's fixed/deployed vs proposed vs rolled back vs blocked). The launch checklist is complete and split between code and founder actions. The founder can see exactly what is already live, what was rolled back, and what still needs him.

Work through it end to end. Be exhaustive on investigation, decisive on the high-value changes, conservative on the irreversible ones, and clear in your reporting. Good luck.
