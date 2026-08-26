import { isOwnedByUser, storagePathFromPublicUrl } from './object-path';

/** Bøtta funn-bilder ligger i (migrasjon 019). */
export const FINDING_IMAGE_BUCKET = 'finding-images';

export interface FindingImageRow {
  user_id: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
}

/**
 * Filstiene ETT funn eier i `finding-images`.
 *
 * `image_url` og `thumbnail_url` peker i dag på samme fil (AddFindingSheet
 * sender samme URL i begge feltene), så dedupliseringen er ikke pynt — uten
 * den ville hver rydding forsøkt å slette samme sti to ganger.
 *
 * Vaktene, i rekkefølge:
 *  1. URL-en må være en offentlig adresse i NØYAKTIG denne bøtta.
 *  2. Stien må ligge i funn-eierens egen mappe.
 *
 * Punkt 2 er det viktige. `imageUrl` kommer fra nettleseren når funnet lagres
 * (POST /api/findings), så en bruker kan skrive en annen brukers bilde-URL inn
 * i sitt eget funn. Uten eierskapsvakten ville «lagre funn med andres
 * bilde-URL → slett funnet → vent 30 dager» slettet en annens bilde. En URL
 * som ikke består vakten blir stående; å la en fil ligge er alltid det minst
 * skadelige utfallet her.
 *
 * Rader uten eier (user_id ble NULL av kontoslettings-cascaden i migrasjon
 * 011) gir tom liste: da finnes det ingen mappe å måle eierskap mot.
 */
export function findingImagePaths(row: FindingImageRow): string[] {
  if (!row.user_id) return [];

  const paths = new Set<string>();
  for (const url of [row.image_url, row.thumbnail_url]) {
    const path = storagePathFromPublicUrl(url, FINDING_IMAGE_BUCKET);
    if (path && isOwnedByUser(path, row.user_id)) paths.add(path);
  }
  return [...paths];
}
