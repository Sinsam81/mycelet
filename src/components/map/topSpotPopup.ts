/**
 * Popupen på et søkeområde.
 *
 * Lå inline i MushroomMap.tsx, som ingen test laster (Leaflet + DOM). Den
 * eneste påstanden brukeren faktisk leser sto altså utenfor testdekning — og
 * det var nettopp teksten som lovet for mye: «Topp 1» over et punkt, og «Fant
 * du sopp her?» om en rute på flere kilometer.
 *
 * Bygges her, som ren streng, slik at testene kan holde fast på hva den sier:
 * ingen rangering, og «i dette området» der vi før skrev «her».
 */

import type { AreaReport } from '@/lib/prediction/area-report';

export type TopSpotTranslate = (key: string, values?: Record<string, string | number>) => string;

/**
 * Rapportlinjene inneholder navn fra databasen, og Leaflet tar popupen som en
 * HTML-streng. Alt som ikke er vår egen markup escapes derfor.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Områderapporten som lesbare avsnitt: overskrift + korte linjer. */
function areaReportHtml(report: AreaReport | undefined): string {
  if (!report || report.sections.length === 0) return '';
  return report.sections
    .map((section) => {
      const lines = section.lines
        .map((line) => `<div style="margin-top:3px">${escapeHtml(line)}</div>`)
        .join('');
      return `<div style="margin-top:9px">
        <div style="font-size:11px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:#4b5563">${escapeHtml(section.heading)}</div>
        <div style="font-size:12px;color:#1f2937;line-height:1.45">${lines}</div>
      </div>`;
    })
    .join('');
}

export type TopSpotForPopup = {
  lat: number;
  lng: number;
  score: number;
  verdict?: string;
  reasons?: string[];
  topSpecies?: string[];
  report?: AreaReport;
};

/**
 * Bredden på søkeområdet, i km, formatert for lesing.
 *
 * Desimalskilletegnet må følge språket. Resten av rapporten går gjennom
 * `Intl` og skriver «1,1 km» og «0,71» på norsk; en `toFixed(1)` her ga
 * «1.4 km» i samme avsnitt. Blandet tegnsetting i én tekst er det som får
 * den til å se maskinskrevet ut.
 */
function areaWidthLabel(radiusM: number, locale: string): string {
  const widthKm = (radiusM * 2) / 1000;
  const desimaler = widthKm >= 10 ? 0 : 1;
  return new Intl.NumberFormat(locale === 'sv' ? 'sv-SE' : 'nb-NO', {
    minimumFractionDigits: desimaler,
    maximumFractionDigits: desimaler
  }).format(widthKm);
}

export function buildTopSpotPopupHtml(input: {
  spot: TopSpotForPopup;
  /** Avstand fra brukerens utgangspunkt til områdets senter. */
  distanceKm: number;
  /** Ferdig oversatt himmelretning ("nordøst"). */
  directionLabel: string;
  /** Radiusen sirkelen tegnes med — samme tall som kartet viser. */
  radiusM: number;
  limited?: boolean;
  speciesId?: number | null;
  /** Leserens språk — styrer desimalskilletegn i bredden. */
  locale?: string;
  t: TopSpotTranslate;
}): string {
  const { spot, distanceKm, directionLabel, radiusM, limited, speciesId, locale = 'nb', t } = input;

  // Områderapporten erstatter stikkordslista når serveren har sendt den: samme
  // opplysninger, men som lesbar tekst om OMRÅDET. Uten rapport (gratisnivå
  // eller et eldre svar) står stikkordene igjen som før.
  const reportHtml = areaReportHtml(spot.report);
  // Artene står i rapportens egen del når den er med, så linja gjentas ikke.
  const topSpeciesHtml =
    !reportHtml && (spot.topSpecies ?? []).length
      ? `<div style="margin-top:6px;font-size:12px;font-weight:600;color:#14532d">${t('mostLikelyInArea', {
          species: (spot.topSpecies ?? []).join(', ')
        })}</div>`
      : '';
  const reasonsHtml =
    reportHtml || (spot.reasons ?? []).length === 0
      ? ''
      : `<div style="font-size:12px;margin-top:6px;color:#1f2937">${(spot.reasons ?? [])
          .map((r) => `<div style="margin-top:3px">${escapeHtml(r)}</div>`)
          .join('')}</div>`;
  const limitedHtml = limited
    ? `<div style="margin-top:6px;font-size:12px;color:#92400e;background:#fef3c7;border-radius:8px;padding:5px 8px">${t('premiumWhyHigh')}</div>`
    : '';

  // Forklaringen, ikke ansvarsfraskrivelsen: hva sirkelen ER, hva som valgte
  // den ut, og at soppen står flekkvis inne i den. Bredden kommer fra
  // rutenettets faktiske cellestørrelse (se spot-area.ts).
  const explainerHtml = `<div style="margin-top:7px;font-size:11px;line-height:1.45;color:#4b5563;background:#f3f4f6;border-radius:8px;padding:6px 8px">${t(
    'searchAreaExplainer',
    { km: areaWidthLabel(radiusM, locale) }
  )}</div>`;

  const feedbackHtml = `<div data-spot-feedback data-lat="${spot.lat}" data-lng="${spot.lng}" data-score="${spot.score}"${
    speciesId ? ` data-species="${speciesId}"` : ''
  } data-model="v4_species_spots_habitat" data-source="computed_top_spots" style="margin-top:8px;border-top:1px solid #e5e7eb;padding-top:7px">
          <div style="font-size:12px;font-weight:600;color:#1f2937">${t('foundInThisArea')}</div>
          <div style="display:flex;gap:6px;margin-top:5px">
            <button type="button" data-fb="yes" style="flex:1;background:#15803d;color:#fff;border:none;border-radius:8px;padding:5px 0;font-size:12px;font-weight:600;cursor:pointer">${t('feedbackYes')}</button>
            <button type="button" data-fb="no" style="flex:1;background:#f3f4f6;color:#374151;border:none;border-radius:8px;padding:5px 0;font-size:12px;font-weight:600;cursor:pointer">${t('feedbackNo')}</button>
          </div>
        </div>`;

  // Overskriften er verdikten fra modellen, ellers en nøytral etikett. Det som
  // IKKE står her er rangeringstallet: valideringen skiller ikke område 1 fra
  // område 4, og da skal ikke kartet nummerere dem.
  // Rapporten er lengre enn stikkordene var, så teksten får rulle inne i
  // popupen i stedet for å vokse ut av kartet på en liten skjerm.
  return `<div style="min-width:230px;max-width:290px;max-height:60vh;overflow-y:auto">
          <div style="font-weight:700;color:#14532d">${spot.verdict ?? t('promisingArea')}</div>
          <div style="color:#555;font-size:12px;margin-top:2px">~${new Intl.NumberFormat(locale === 'sv' ? 'sv-SE' : 'nb-NO', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(distanceKm)} km ${directionLabel} · ${spot.score}/100</div>
          ${topSpeciesHtml}
          ${reportHtml}
          ${reasonsHtml}
          ${limitedHtml}
          ${explainerHtml}
          <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank" rel="noreferrer" style="display:block;margin-top:7px;color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMapNavigate')}</a>
          ${feedbackHtml}
          <div style="color:#9ca3af;font-size:10px;margin-top:6px">${t('sourcesCredit')}</div>
        </div>`;
}
