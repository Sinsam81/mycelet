import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import {
  finnFrikjennendeFormuleringer,
  harHandlingsråd,
  KREVER_HANDLING
} from '../forvekslingstekst';

/**
 * Denne testen kjører mot SELVE MIGRASJONSTEKSTEN, ikke mot en kopi.
 *
 * Forvekslingsdataene er det eneste innholdet i appen som leses av noen som står
 * med en sopp i hånda og skal bestemme seg. Reglene er dyrekjøpte — tre
 * motprøverunder — og en kommentar i en SQL-fil holder dem ikke i live.
 *
 * Legger noen til en ny forvekslingsrad med frikjennende formulering, feiler denne.
 */

const MIGRASJONER = join(process.cwd(), 'supabase', 'migrations');

/**
 * Plukker ut (likhet, skille, faregrad) fra look_alikes-innsettingene.
 *
 * Alle migrasjonene bruker samme kolonnerekkefølge — (species_id, look_alike_id,
 * similarity_description, difference_description, danger_level) — men to former:
 * én rad per INSERT (048/049) og en VALUES-liste med mange rader (012/017).
 * Trippelen «to strenger etterfulgt av en faregrad» treffer begge.
 */
const TRIPPEL = /'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*,\s*'(low|medium|high|critical)'/g;

function forvekslingsrader(): Array<{
  fil: string;
  likhet: string;
  skille: string;
  faregrad: string;
}> {
  const ut: Array<{ fil: string; likhet: string; skille: string; faregrad: string }> = [];
  const av = (s: string) => s.replace(/''/g, "'");
  for (const fil of readdirSync(MIGRASJONER).filter((f) => f.endsWith('.sql'))) {
    const sql = readFileSync(join(MIGRASJONER, fil), 'utf8');
    if (!sql.includes('look_alikes')) continue;
    for (const m of sql.matchAll(TRIPPEL)) {
      // CHECK-beskrankningen i 001 er «'low', 'medium', 'high'» og treffer ellers
      // mønsteret. Ekte beskrivelser er alltid vesentlig lengre.
      if (m[1].length < 30 || m[2].length < 30) continue;
      ut.push({ fil, likhet: av(m[1]), skille: av(m[2]), faregrad: m[3] });
    }
  }
  return ut;
}

/**
 * Migrasjonene som ble skrevet UNDER reglene i forvekslingstekst.ts.
 *
 * De eldre radene (012, 017, 027) ble skrevet før reglene fantes og står allerede
 * i produksjon — de kan ikke endres i ettertid uten å lyve om hva som faktisk ble
 * kjørt. De rettes i stedet av migrasjon 050, som legger handlingsrådet til i
 * databasen. Se testen «gamle rader er patchet av 050» nedenfor.
 */
const SKREVET_UNDER_REGLENE = /^(04[89]|0[5-9]\d|[1-9]\d\d)_/;

describe('forvekslingstekstene i migrasjonene', () => {
  const rader = forvekslingsrader();

  it('finner faktisk radene — ellers tester vi ingenting', () => {
    expect(rader.length, 'ingen forvekslingsrader funnet i migrasjonene').toBeGreaterThan(20);
  });

  it('inneholder ingen frikjennende formulering', () => {
    const brudd: string[] = [];
    for (const r of rader) {
      for (const tekst of [r.likhet, r.skille]) {
        for (const f of finnFrikjennendeFormuleringer(tekst)) {
          brudd.push(`${r.fil}: «${f.treff}» — ${f.hvorfor}\n    i: ${tekst.slice(0, 110)}…`);
        }
      }
    }
    expect(brudd, `\n${brudd.join('\n')}\n`).toEqual([]);
  });

  it('avslutter alle kritiske og høye advarsler med et handlingsråd', () => {
    // Bare SKILLE-teksten trenger rådet — likhets-teksten forklarer bare hvorfor
    // de forveksles. En advarsel som beskriver faren uten å si hva man skal gjøre,
    // etterlater valget hos noen som nettopp har fått vite at de er usikre.
    const uten = rader
      .filter((r) => SKREVET_UNDER_REGLENE.test(r.fil))
      .filter((r) => KREVER_HANDLING.includes(r.faregrad) && !harHandlingsråd(r.skille))
      .map((r) => `${r.fil} [${r.faregrad}]: ${r.skille.slice(0, 130)}…`);
    expect(uten, `\n${uten.join('\n')}\n`).toEqual([]);
  });

  it('har en migrasjon som patcher de gamle radene i databasen', () => {
    // 17 av 22 kritiske/høye advarsler i produksjon manglet handlingsråd da denne
    // testen ble skrevet — blant dem grønnkremle mot grønn fluesopp. De eldre
    // migrasjonsfilene kan ikke endres i ettertid, så 050 retter dataene i stedet.
    // Forsvinner den, står produksjonen igjen med advarsler uten råd.
    const filer = readdirSync(MIGRASJONER);
    const patch = filer.find((f) => /^050_/.test(f));
    expect(patch, 'migrasjon 050 mangler').toBeTruthy();
    const sql = readFileSync(join(MIGRASJONER, patch as string), 'utf8');
    expect(sql).toMatch(/UPDATE look_alikes/);
    expect(sql).toMatch(/Ved tvil — la den stå\./);
    expect(sql, 'må hoppe over rader som allerede har råd, ellers stables setningene')
      .toMatch(/!~\*/);
  });

  it('lar de gamle radene være dokumentert, ikke glemt', () => {
    // Vokteren mot at noen «rydder» unntaket bort uten å vite hvorfor det finnes.
    const gamle = rader.filter(
      (r) => !SKREVET_UNDER_REGLENE.test(r.fil) && KREVER_HANDLING.includes(r.faregrad)
    );
    expect(gamle.length, 'ingen gamle rader — da kan unntaket fjernes').toBeGreaterThan(0);
  });
});

describe('mønstrene fanger det de skal', () => {
  it('fanger de fire formuleringene motprøven stoppet i runde 2', () => {
    const ekte = [
      'Er smaken mild, er du trygg.',
      'Lukt og smak kan ikke frikjenne funnet — bare hatt, skiver og voksested kan det.',
      'Soppen gir ingen forgiftning i seg selv hvis du holder deg unna alkohol.',
      'Er skivene hvite, kan du spise den.'
    ];
    for (const t of ekte) {
      expect(finnFrikjennendeFormuleringer(t), t).not.toEqual([]);
    }
  });

  it('slipper gjennom riktig, ensrettet formulering', () => {
    const greie = [
      'Smaksprøven kan bare dømme, aldri frikjenne.',
      'Mild smak frikjenner ingen musserong.',
      'VANNKLAR melk betyr at funnet er ute — la den stå.',
      'Hvit melk utelukker lakrisriske, men frikjenner ingenting.',
      'Arten regnes ikke som matsopp uansett — den bør ikke spises, heller ikke av avholdende.',
      'Et hvitt til blekt rosa avtrykk avgjør ingenting oppover — det utelukker bare slørsopp.'
    ];
    for (const t of greie) {
      expect(finnFrikjennendeFormuleringer(t), t).toEqual([]);
    }
  });

  it('godtar «la den stå» som handlingsråd, men ikke ren beskrivelse', () => {
    expect(harHandlingsråd('Ved tvil — la stå.')).toBe(true);
    expect(harHandlingsråd('Finner du ikke oransje i melkesaften, la den stå.')).toBe(true);
    expect(harHandlingsråd('Pantermusserong er større og kraftigere.')).toBe(false);
  });
});
