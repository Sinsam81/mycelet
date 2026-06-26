// Bump this whenever the Terms (/vilkar) or purchase terms (/kjopsvilkar) change
// in a way users should re-accept. Recorded on the auth user at signup as a
// provable, timestamped consent record (user_metadata.terms_version +
// terms_accepted_at) — no separate table needed.
export const TERMS_VERSION = '2026-06-26';
