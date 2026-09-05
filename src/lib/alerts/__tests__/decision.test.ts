import { describe, expect, it } from 'vitest';
import {
  skalVarsle,
  VARSEL_KARANTENE_DAGER,
  VARSEL_MIN_OKNING,
  VARSEL_MIN_SCORE,
  type VarselTilstand
} from '../decision';

/**
 * Testene her er skrevet mot det som gjør at folk slår AV varsler, ikke mot at
 * de virker. Å sende en e-post når alt stemmer er den lette halvparten; å tie
 * de andre 51 ukene i året er den som avgjør om funksjonen overlever.
 *
 * Sesongtesten nederst er ikke pynt. Den fanget en ekte designfeil i første
 * utgave: økningen ble målt mot GÅRSDAGEN, og en jevn opptur på seks poeng om
 * dagen krysset terskelen uten at noen enkeltdag kvalifiserte. Varselet tidde
 * gjennom hele bedringen. Nå måles den mot ukas bunn.
 */

const NAA = new Date('2026-08-20T05:00:00Z');

function tilstand(over: Partial<VarselTilstand> = {}): VarselTilstand {
  return {
    scoreIDag: 90,
    scoreIGar: 60,
    lavesteSisteUke: 55,
    sistVarsletIso: null,
    naa: NAA,
    ...over
  };
}

/** n dager før NAA, som ISO — så testene slipper å regne på millisekunder. */
function dagerSiden(n: number): string {
  return new Date(NAA.getTime() - n * 86_400_000).toISOString();
}

describe('skalVarsle — flanken', () => {
  it('varsler når forholdene snur fra dårlig til bra', () => {
    expect(skalVarsle(tilstand())).toEqual({ send: true, fra: 55, til: 90 });
  });

  it('viser ukas bunn som utgangspunkt, ikke gårsdagen', () => {
    // E-posten sier «gikk fra X til Y». X skal være det mottakeren har opplevd
    // den siste uka, ikke et mellomsteg fra i går.
    const b = skalVarsle(tilstand({ scoreIGar: 78, lavesteSisteUke: 41, scoreIDag: 92 }));
    expect(b).toEqual({ send: true, fra: 41, til: 92 });
  });

  it('tier når det var bra i går også — da er ingenting nytt', () => {
    // Hele grunnen til at regelen er en flanke og ikke et nivå: terskelen er
    // regionskalaens topp-dom, og selv den passeres ~hver sjette dag i sesong,
    // så en nivåregel ville sendt e-post hver uke i august.
    expect(skalVarsle(tilstand({ scoreIGar: 88, scoreIDag: 92 }))).toEqual({
      send: false,
      grunn: 'var-allerede-bra'
    });
  });

  it('varsler igjen etter et tilbakefall', () => {
    // 90 → 50 → 88 to uker senere. Sammenlignet med SISTE VARSLEDE verdi (90)
    // ville 88 vært en nedgang og gitt taushet. Flanken fanger det riktig.
    const b = skalVarsle(
      tilstand({ scoreIGar: 50, lavesteSisteUke: 44, scoreIDag: 88, sistVarsletIso: dagerSiden(14) })
    );
    expect(b).toEqual({ send: true, fra: 44, til: 88 });
  });

  it('tier under terskelen, uansett hvor stor økningen er', () => {
    // 20 → rett under terskelen er en dramatisk bedring, men fortsatt ikke en
    // dag vi vil be noen ta fri for. Vi selger ikke bevegelse, vi selger «verdt turen».
    expect(skalVarsle(tilstand({ lavesteSisteUke: 20, scoreIGar: 70, scoreIDag: VARSEL_MIN_SCORE - 1 }))).toEqual({
      send: false,
      grunn: 'under-terskel'
    });
  });
});

describe('skalVarsle — økningen måles mot uka', () => {
  it('tier når uka har vippet rundt terskelen uten å bevege seg', () => {
    // 80-81-80-81: krysser terskelen annenhver dag, men ingenting har skjedd.
    const b = skalVarsle(
      tilstand({ scoreIGar: VARSEL_MIN_SCORE - 1, lavesteSisteUke: VARSEL_MIN_SCORE - 1, scoreIDag: VARSEL_MIN_SCORE })
    );
    expect(b).toEqual({ send: false, grunn: 'for-liten-okning' });
  });

  it('varsler på en jevn opptur der ingen enkeltdag stiger nok', () => {
    // ⚠️ REGRESJONSVAKT. Dette er feilen den første utgaven hadde: seks poeng om
    // dagen, aldri åtte, så varselet tidde gjennom hele bedringen.
    const uke = [55, 61, 67, 73, 79, 85];
    const b = skalVarsle({
      scoreIDag: uke[5],
      scoreIGar: uke[4],
      lavesteSisteUke: Math.min(...uke),
      sistVarsletIso: null,
      naa: NAA
    });
    expect(b).toEqual({ send: true, fra: 55, til: 85 });
  });

  it('slipper gjennom nøyaktig på minstekravet', () => {
    const bunn = VARSEL_MIN_SCORE - VARSEL_MIN_OKNING;
    const b = skalVarsle(tilstand({ scoreIGar: bunn, lavesteSisteUke: bunn, scoreIDag: VARSEL_MIN_SCORE }));
    expect(b).toEqual({ send: true, fra: bunn, til: VARSEL_MIN_SCORE });
  });
});

describe('skalVarsle — feilet utsending hentes inn igjen', () => {
  // Scenariet: forholdene snudde i går, men Resend var nede da e-posten skulle
  // ut. Raden ble ikke oppdatert. Uten omslagsdatoen ville regel 3 sagt
  // «var-allerede-bra» i dag, og abonnenten mistet hele den gode perioden.

  it('varsler dagen etter når abonnenten aldri fikk e-post for omslaget', () => {
    const b = skalVarsle(
      tilstand({ scoreIGar: 88, scoreIDag: 90, sisteOmslagIso: '2026-08-19', sistVarsletIso: null })
    );
    expect(b).toEqual({ send: true, fra: 55, til: 90 });
  });

  it('tier når varselet for denne syklusen allerede er sendt', () => {
    // Sist varslet i går kl. 05 — ETTER omslaget ved midnatt. Ingenting å ta igjen.
    const b = skalVarsle(
      tilstand({ scoreIGar: 88, scoreIDag: 90, sisteOmslagIso: '2026-08-19', sistVarsletIso: dagerSiden(1) })
    );
    expect(b).toEqual({ send: false, grunn: 'var-allerede-bra' });
  });

  it('tier når det ikke finnes noe omslag i vinduet', () => {
    // Har det vært bra lenger enn historikken rekker, er det ikke en nyhet som
    // kan «tas igjen» — da gjelder den vanlige regelen.
    expect(skalVarsle(tilstand({ scoreIGar: 88, scoreIDag: 92 }))).toEqual({
      send: false,
      grunn: 'var-allerede-bra'
    });
  });

  it('gjeninnhentingen respekterer fortsatt økningskravet', () => {
    // En flat, god uke med et omslag helt i kanten skal ikke plutselig slippe
    // gjennom bare fordi utsendingen aldri har skjedd.
    const b = skalVarsle(
      tilstand({
        scoreIGar: 88,
        scoreIDag: 90,
        lavesteSisteUke: 85,
        sisteOmslagIso: '2026-08-19',
        sistVarsletIso: null
      })
    );
    expect(b).toEqual({ send: false, grunn: 'for-liten-okning' });
  });

  it('gjeninnhentingen respekterer fortsatt karantenen', () => {
    // Forrige sykluses varsel gikk for tre dager siden; omslaget i går feilet.
    // Maks én e-post i uka gjelder også her.
    const b = skalVarsle(
      tilstand({ scoreIGar: 88, scoreIDag: 90, sisteOmslagIso: '2026-08-19', sistVarsletIso: dagerSiden(3) })
    );
    expect(b).toEqual({ send: false, grunn: 'i-karantene' });
  });
});

describe('skalVarsle — karantenen', () => {
  it('sender ikke to ganger i samme uke', () => {
    expect(skalVarsle(tilstand({ sistVarsletIso: dagerSiden(3) }))).toEqual({
      send: false,
      grunn: 'i-karantene'
    });
  });

  it('slipper gjennom når karantenen er ute', () => {
    expect(skalVarsle(tilstand({ sistVarsletIso: dagerSiden(VARSEL_KARANTENE_DAGER) }))).toMatchObject({
      send: true
    });
  });
});

describe('skalVarsle — manglende data', () => {
  it('tier når gårsdagens fliser mangler', () => {
    // Cron-jobben kan ha feilet. Da vet vi ikke om dette er en overgang eller
    // den femte grønne dagen på rad, og vi gjetter ikke på brukerens vegne.
    expect(skalVarsle(tilstand({ scoreIGar: null }))).toEqual({ send: false, grunn: 'ingen-gaardag' });
  });
});

describe('skalVarsle — hele sesongen, ikke bare én dag', () => {
  /** Kjører en scoresekvens dag for dag og teller e-postene. */
  function sesong(scorer: number[]): number[] {
    let sist: string | null = null;
    const sendt: number[] = [];
    for (let d = 1; d < scorer.length; d++) {
      const naa = new Date(NAA.getTime() + d * 86_400_000);
      const uke = scorer.slice(Math.max(0, d - 6), d + 1);
      const b = skalVarsle({
        scoreIDag: scorer[d],
        scoreIGar: scorer[d - 1],
        lavesteSisteUke: Math.min(...uke),
        sistVarsletIso: sist,
        naa
      });
      if (b.send) {
        sendt.push(b.til);
        sist = naa.toISOString();
      }
    }
    return sendt;
  }

  it('sender ett varsel per værsyklus, ikke ett per grønn dag', () => {
    // 60 dager med sagtann: kryper opp, faller brått etter tørke, kryper opp
    // igjen. Fem sykluser. Ett varsel per syklus er riktig; mer er spam.
    const scorer: number[] = [];
    for (let d = 0; d < 60; d++) {
      const syklus = d % 12;
      scorer.push(syklus < 8 ? 55 + syklus * 6 : 95 - (syklus - 8) * 14);
    }
    const sendt = sesong(scorer);
    expect(sendt.length).toBeGreaterThan(0);
    expect(sendt.length).toBeLessThanOrEqual(5);
  });

  it('tier gjennom en hel tørkesesong', () => {
    // 60 dager der ingenting kommer over terskelen. Null e-poster.
    expect(sesong(Array.from({ length: 60 }, (_, d) => 40 + (d % 5) * 3))).toEqual([]);
  });

  it('tier gjennom en sammenhengende god periode', () => {
    // Etter det første varselet er de neste 30 grønne dagene ikke nyheter.
    const scorer = [50, ...Array.from({ length: 30 }, () => 92)];
    expect(sesong(scorer)).toEqual([92]);
  });
});
