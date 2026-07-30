/**
 * Pre-publication content filter for forum posts and comments.
 *
 * Apple App Review 1.2 requires apps with user-generated content to have "a
 * method for filtering objectionable material from being posted". This is that
 * method on the client, so the user gets an immediate, explainable message
 * instead of a raw database error.
 *
 * The AUTHORITATIVE copy is the trigger in
 * supabase/migrations/032_block_users_and_content_filter.sql — a client check
 * alone would be bypassable by talking to the API directly. Keep the two in
 * sync: the patterns below are the same ones, written in JS regex form.
 *
 * Deliberately narrow. The text must contain BOTH a substance name AND a word
 * indicating trade, cultivation or place-sharing. A plain warning like
 * "fleinsopp er ulovlig i Norge" passes — we do not want to stop people saying
 * that it is illegal. The target is supply and demand, not the word itself.
 */

/** Psilocybin-containing species, in the forms people actually write them. */
const SUBSTANCE =
  /(fleinsopp|psilocyb|psilocin|magic\s?mushroom|liberty\s?cap|toppsl[aä]tskivling|semilanceata|cubensis)/i;

/** Trade, cultivation or location-sharing intent, Norwegian and Swedish. */
const INTENT =
  /(selg|selger|kj[oø]p|k[oö]p|s[aä]lj|byttes?|byta|dyrk|odla|spore?spr[oø]yte|spore\s?syringe|sporer til salgs|voksested|v[aä]xtplats|koordinat|dm\s?(meg|mig)|send(er|es)?\s+(til|mot))/i;

export type ContentRejection = 'controlled_substance_trade';

export interface ContentCheckResult {
  ok: boolean;
  /** Set when ok is false — lets the caller pick the right translated message. */
  reason?: ContentRejection;
}

/**
 * Check a post or comment before it is submitted.
 *
 * @param parts Any user-supplied text fields (title, body, image caption …).
 *              Undefined and null entries are ignored, so callers can pass
 *              optional fields directly.
 */
export function checkContent(...parts: Array<string | null | undefined>): ContentCheckResult {
  const text = parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(' ');
  if (!text) return { ok: true };

  if (SUBSTANCE.test(text) && INTENT.test(text)) {
    return { ok: false, reason: 'controlled_substance_trade' };
  }

  return { ok: true };
}

/**
 * True when a Supabase error came from the database-side filter, so the caller
 * can show the same friendly message as the client-side check rather than a
 * Postgres exception string. Matches the message the trigger raises.
 */
export function isProhibitedContentError(error: unknown): boolean {
  if (!error) return false;
  const message =
    typeof error === 'string'
      ? error
      : typeof (error as { message?: unknown }).message === 'string'
        ? (error as { message: string }).message
        : '';
  return message.includes('MYCELET_PROHIBITED_CONTENT');
}
