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

export type TopSpotTranslate = (key: string, values?: Record<string, string | number>) => string;

export type TopSpotForPopup = {
  lat: number;
  lng: number;
  score: number;
  verdict?: string;
  reasons?: string[];
  topSpecies?: string[];
};

/** Bredden på søkeområdet, i km, formatert for lesing. */
function areaWidthLabel(radiusM: number): string {
  const widthKm = (radiusM * 2) / 1000;
  return widthKm >= 10 ? String(Math.round(widthKm)) : widthKm.toFixed(1);
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
  t: TopSpotTranslate;
}): string {
  const { spot, distanceKm, directionLabel, radiusM, limited, speciesId, t } = input;

  const topSpeciesHtml = (spot.topSpecies ?? []).length
    ? `<div style="margin-top:6px;font-size:12px;font-weight:600;color:#14532d">${t('mostLikelyInArea', {
        species: (spot.topSpecies ?? []).join(', ')
      })}</div>`
    : '';
  const reasonsHtml = (spot.reasons ?? []).map((r) => `<div style="margin-top:3px">${r}</div>`).join('');
  const limitedHtml = limited
    ? `<div style="margin-top:6px;font-size:12px;color:#92400e;background:#fef3c7;border-radius:8px;padding:5px 8px">${t('premiumWhyHigh')}</div>`
    : '';

  // Forklaringen, ikke ansvarsfraskrivelsen: hva sirkelen ER, hva som valgte
  // den ut, og at soppen står flekkvis inne i den. Bredden kommer fra
  // rutenettets faktiske cellestørrelse (se spot-area.ts).
  const explainerHtml = `<div style="margin-top:7px;font-size:11px;line-height:1.45;color:#4b5563;background:#f3f4f6;border-radius:8px;padding:6px 8px">${t(
    'searchAreaExplainer',
    { km: areaWidthLabel(radiusM) }
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
  return `<div style="min-width:210px;max-width:265px">
          <div style="font-weight:700;color:#14532d">${spot.verdict ?? t('promisingArea')}</div>
          <div style="color:#555;font-size:12px;margin-top:2px">~${distanceKm.toFixed(1)} km ${directionLabel} · ${spot.score}/100</div>
          ${topSpeciesHtml}
          <div style="font-size:12px;margin-top:6px;color:#1f2937">${reasonsHtml}</div>
          ${limitedHtml}
          ${explainerHtml}
          <a href="https://www.google.com/maps/search/?api=1&query=${spot.lat},${spot.lng}" target="_blank" rel="noreferrer" style="display:block;margin-top:7px;color:#15803d;font-weight:600;font-size:12px;text-decoration:underline">${t('openInMapNavigate')}</a>
          ${feedbackHtml}
          <div style="color:#9ca3af;font-size:10px;margin-top:6px">${t('sourcesCredit')}</div>
        </div>`;
}
