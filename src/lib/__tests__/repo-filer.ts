import { execFileSync } from 'node:child_process';
import { lstatSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Filene som er sjekket inn, pluss nye filer git ikke ignorerer — alt som kan
 * havne i neste commit. Stiene er relative til roten, med / som skille.
 *
 * Fra git, ikke fra en liste over kataloger. En liste glemmer det ingen tenkte
 * på: hemmelighetsvakta leste verken rotfilene (CLAUDE.md, README.md,
 * .env.example), public/ utenom landing, ios/, android/ eller .github/. Og
 * .gitignore vet allerede hva som aldri sjekkes inn: node_modules, .next,
 * .env.local og worktreene.
 *
 * Nye filer er med fordi testene kjøres FØR `git add`: en hemmelighet i en
 * fil som ennå ikke er lagt til, skal felle testen før den havner i en commit.
 * Filer som er slettet, men står i indeksen, og symlenker hoppes over.
 */
export function repoFiler(rot: string = process.cwd()): string[] {
  const ut = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: rot,
    maxBuffer: 16 * 1024 * 1024
  }).toString('utf8');
  return [...new Set(ut.split('\0').filter(Boolean))]
    .filter((sti) => {
      try {
        return lstatSync(join(rot, sti)).isFile();
      } catch {
        return false;
      }
    })
    .sort();
}
