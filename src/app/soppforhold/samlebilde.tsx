import { regionBand } from '@/lib/prediction/region-score';
import { bestePerLand, erStille, tallDato, type SoppforholdRegion } from './hent-regioner';

/**
 * Innholdet i delingsbildet for samlesiden (/soppforhold) — tegningen selv,
 * skilt ut av opengraph-image.tsx så den kan testes uten å lage et bilde.
 *
 * ── BILDET KAN IKKE VELGE SPRÅK ─────────────────────────────────────────────
 *
 * Siden følger leseren: svensk tekst og Sverige først for svenske lesere. Men
 * bildet hentes av Facebooks, Slacks og iMessages skrapere, og de sender verken
 * språkcookie eller svensk Accept-Language. Bildet sa derfor «Soppforhold i
 * Norge i dag» og «Best akkurat nå: <norsk område>» til alle — en svensk leser
 * som delte siden, delte et norsk kort om Norge.
 *
 * Derfor er bildet nå riktig for BEGGE i stedet for å gjette:
 *
 *   · det beste området i hvert land, Norge og Sverige (bestePerLand)
 *   · de få ordene som må stå, står på begge språk. «Norge», «Sverige» og
 *     «av 100» skrives likt på norsk og svensk, og datoen står som tall
 *   · ingen dom og ingen artsnavn — de er setninger på ETT språk. Områdenavn
 *     er egennavn
 *
 * Samme flate-tegning som områdebildene: bare rektangler og tekst, ingen fonter
 * eller bilder å laste. Hver <div> med flere barn har display: flex — det
 * krever tegnemotoren (Satori).
 *
 * ⚠️ Ærlighetslinja nederst er den samme som på siden og i varselet, og skal
 * stå på begge språk. Testen src/components/soppforhold/__tests__/
 * forbehold-inngang.test.ts holder den i takt med Forbehold.tsx.
 */

export const SAMLEBILDE_TEKST = {
  etikett: 'Soppforhold i dag · Svampläget idag',
  land: { NO: 'Norge', SE: 'Sverige' },
  avHundre: 'av 100',
  utenomSesong: ['Utenom hovedsesongen — stille i alle områdene nå', 'Utanför högsäsongen — stilla i alla områden nu'],
  ikkeKlar: 'Oppdateres hver morgen · Uppdateras varje morgon',
  forbehold: [
    'Vær, sesong og skogtype for området, ikke skogen der du står',
    'Väder, säsong och skogstyp för området, inte skogen där du står'
  ],
  adresse: 'mycelet.com/soppforhold'
} as const;

const DEMPET = '#cfe0c2';

/**
 * Båndfargene for TALL på den mørkegrønne bakgrunnen (#1A3409).
 *
 * Båndet er regionstigens eget (regionBand — samme som prikken og søylen på
 * siden, så farge og dom aldri kan si hver sin ting). Bare nyansen av grønt er
 * lysere her: stigens grønn (#4d7c3a) har kontrast 2,8:1 mot bakgrunnen, så
 * toppdommen var det tallet i bildet som var vanskeligst å lese — akkurat den
 * dagen bildet er mest verdt å dele. forest-400 gir 5,3:1. Gult og grått er
 * stigens egne (6,4:1 og 5,4:1).
 */
export const BANDFARGE_PA_MORK: Record<ReturnType<typeof regionBand>, string> = {
  green: '#7FAE5E',
  amber: '#f59e0b',
  grey: '#9ca3af'
};

export function samlebilde({
  tileDate,
  regions,
  iHovedsesong
}: {
  tileDate: string | null;
  regions: SoppforholdRegion[];
  /** sesongtilstand(new Date()).iHovedsesong — sendes inn, så tegningen er ren. */
  iHovedsesong: boolean;
}) {
  const t = SAMLEBILDE_TEKST;
  const rader = bestePerLand(regions);
  // Samme regel som siden (innledningsTilstand): utenom sesongen er «Norge:
  // Bergen 4 av 100» en plakat for støy. Krever BÅDE at alle områdene er i
  // laveste bånd og at kalenderen sier desember–mai — en tørr uke i august er
  // ikke «utenom sesongen».
  const utenomSesong = regions.length > 0 && regions.every(erStille) && !iHovedsesong;
  const dato = tallDato(tileDate);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        backgroundColor: '#1A3409',
        color: '#ffffff',
        padding: 64,
        fontFamily: 'sans-serif'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          {/* Soppmerket, tegnet med flater: lys hatt over kort stilk. */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 56, height: 34, borderRadius: 28, backgroundColor: '#f5f1e6' }} />
            <div style={{ width: 18, height: 20, marginTop: -4, borderRadius: 6, backgroundColor: '#e9e2d0' }} />
          </div>
          <div style={{ display: 'flex', fontSize: 40 }}>Mycelet</div>
        </div>
        <div style={{ display: 'flex', fontSize: 28, color: DEMPET }}>{t.adresse}</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', fontSize: 34, color: DEMPET }}>
          {dato ? `${t.etikett} · ${dato}` : t.etikett}
        </div>
        {utenomSesong ? (
          t.utenomSesong.map((linje) => (
            <div key={linje} style={{ display: 'flex', fontSize: 38 }}>
              {linje}
            </div>
          ))
        ) : rader.length > 0 ? (
          rader.map((r) => (
            <div key={r.country} style={{ display: 'flex', alignItems: 'baseline', gap: 18 }}>
              <div style={{ display: 'flex', width: 220, fontSize: 40, color: DEMPET }}>{t.land[r.country]}</div>
              <div style={{ display: 'flex', fontSize: 72 }}>{r.name}</div>
              <div style={{ display: 'flex', fontSize: 72, color: BANDFARGE_PA_MORK[regionBand(r.score)] }}>{r.score}</div>
              <div style={{ display: 'flex', fontSize: 34, color: DEMPET }}>{t.avHundre}</div>
            </div>
          ))
        ) : (
          <div style={{ display: 'flex', fontSize: 38, color: DEMPET }}>{t.ikkeKlar}</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 26, color: DEMPET }}>
        {t.forbehold.map((linje) => (
          <div key={linje} style={{ display: 'flex' }}>
            {linje}
          </div>
        ))}
      </div>
    </div>
  );
}
