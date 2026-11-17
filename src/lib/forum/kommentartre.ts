interface KommentarNode {
  id: string;
  parent_comment_id: string | null;
}

/**
 * Deler kommentarene i toppnivå og svar, med svarene samlet under
 * toppkommentaren de hører til.
 *
 * Tråden vises i to nivåer. Tidligere ble svar slått opp bare på
 * toppkommentarens id, så et svar på et svar — som «Svar»-knappen på et svar
 * lager — telte i kommentartallet, men ble aldri vist. Nå følges kjeden opp til
 * roten, så hele samtalen ligger under samme toppkommentar i den rekkefølgen
 * den kom.
 *
 * Et svar der forelderen ikke er med (skjult, eller skrevet av noen leseren har
 * blokkert) vises fortsatt ikke: uten det den svarer på gir den ingen mening,
 * og den ville røpet at noe er skjult.
 */
export function grupperKommentarer<T extends KommentarNode>(comments: T[]): { topp: T[]; svar: Map<string, T[]> } {
  const perId = new Map(comments.map((c) => [c.id, c]));

  const rotFor = (comment: T): string | null => {
    let current: T = comment;
    // Taket verner mot en sirkel i dataene; så dype kjeder finnes ikke ellers.
    for (let steg = 0; steg < 50; steg += 1) {
      if (!current.parent_comment_id) return current.id;
      const parent = perId.get(current.parent_comment_id);
      if (!parent) return null;
      current = parent;
    }
    return null;
  };

  const topp: T[] = [];
  const svar = new Map<string, T[]>();
  for (const comment of comments) {
    if (!comment.parent_comment_id) {
      topp.push(comment);
      continue;
    }
    const rot = rotFor(comment);
    if (!rot) continue;
    const liste = svar.get(rot) ?? [];
    liste.push(comment);
    svar.set(rot, liste);
  }
  return { topp, svar };
}
