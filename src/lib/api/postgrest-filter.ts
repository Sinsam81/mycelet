/**
 * Verdier i PostgREST-filtre som settes sammen som TEKST.
 *
 * supabase-js escaper verdien selv i `.eq()`, `.ilike()` og de andre
 * enkeltfiltrene. `.or()` gjør det ikke: den tar hele filteret som én streng,
 * `a.eq.x,b.ilike.y`, og sender den videre som den er. Settes brukerens tekst
 * rett inn der, er komma, punktum og parenteser ikke lenger tekst — de er
 * syntaks.
 *
 * HVORFOR
 * Søket i /api/admin/verified-foragers gjorde nettopp det, med
 * tjenesterolle-klienten (som går utenom RLS):
 *
 *   .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
 *
 * Et søk på «Ola, Nordmann» ga en syntaksfeil fra PostgREST (og dermed 500),
 * og et søk på `x%,id.not.is.null` la til et eget vilkår i spørringen.
 * Kolonnene som hentes er faste, så det som kunne presses ut var hvilke
 * profiler som matcher et vilkår søkeren selv fant på — lite, men det er
 * samme feilklasse som SQL-injeksjon, i en rute med full databasetilgang.
 *
 * REGELEN (PostgREST, «reserved characters»)
 * En verdi i et logisk filter (or/and) kan stå i doble anførselstegn. Da er
 * alt inni verdi, og bare to tegn må escapes med backslash: `"` og `\`.
 *
 * LIKE har sitt eget lag under: `%` og `_` er jokertegn, og `\` er
 * escape-tegnet. Tekst som skal matche seg selv må derfor escapes for LIKE
 * FØRST og for PostgREST ETTERPÅ — rekkefølgen er hele poenget, se
 * `inneholderMonster`.
 */

/**
 * En verdi i et logisk filter: i anførselstegn, med `\` og `"` escapet.
 *
 *   .or(`user_id.eq.${id},email.eq.${filterVerdi(epost)}`)
 */
export function filterVerdi(verdi: string): string {
  return `"${verdi.replace(/[\\"]/g, '\\$&')}"`;
}

/** Tekst som skal matche seg selv i LIKE/ILIKE: `%`, `_` og `\` er ikke lenger jokertegn. */
export function likeBokstavelig(tekst: string): string {
  return tekst.replace(/[\\%_]/g, '\\$&');
}

/**
 * «Inneholder teksten», ferdig til å stå etter `ilike.` i et or-filter:
 *
 *   const m = inneholderMonster(q);
 *   .or(`username.ilike.${m},display_name.ilike.${m}`)
 *
 * Ett tegn står igjen som jokertegn: `*`. PostgREST bytter det ubetinget til
 * `%` i like/ilike og har ingen måte å skrive det bokstavelig på. Det kan bare
 * gjøre treffet videre innenfor samme kolonne — aldri legge til et vilkår.
 */
export function inneholderMonster(tekst: string): string {
  return filterVerdi(`%${likeBokstavelig(tekst)}%`);
}
