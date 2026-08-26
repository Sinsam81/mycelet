/**
 * Markøren og popupen for brukerens egne markerte steder (saved_places).
 *
 * ── HVORFOR IKKE EN SOPPMARKØR ──────────────────────────────────────────────
 *
 * Et markert sted er ikke et funn. Funnmarkørene bærer to signaler allerede —
 * formen sier hvilken slekt, fargen sier spiselighet (se speciesMarkerIcon.ts)
 * — og et importert veipunkt har ingen av delene. Fikk stedene en soppmarkør,
 * ville en nål brukeren satte på parkeringsplassen sett ut som et registrert
 * funn av en ukjent sopp. Derfor en bokmerkenål i en farge ingen soppmarkør
 * bruker: ikke grønn (spiselig), ikke rød (giftig), ikke grå (ukjent).
 *
 * ── HVORFOR POPUPEN BYGGES SOM DOM, IKKE SOM HTML-STRENG ────────────────────
 *
 * Navnet og notatet kommer fra en fil brukeren har fått fra en annen app. Med
 * `textContent` finnes det ingen escaping å glemme: et stedsnavn som er ren
 * markup blir stående som tekst, fordi det aldri tolkes. topSpotPopup.ts må
 * escape manuelt (Leaflet tar en streng der); her slipper vi, og da skal vi.
 */

export interface StedForKart {
  id: string;
  name: string;
  note: string | null;
  latitude: number;
  longitude: number;
}

export interface StedPopupTekster {
  /** «Jeg fant sopp her» — broen fra markert sted til ekte funn. */
  funnHer: string;
}

/** Bokmerkenål i indigo. Ingen soppmarkør bruker denne fargen. */
export function stedIkonHtml(size = 28): string {
  return (
    `<div style="display:flex;align-items:center;justify-content:center;` +
    `width:${size}px;height:${size}px;border-radius:9999px;border:2px solid #fff;` +
    `box-shadow:0 3px 8px rgba(0,0,0,0.3);background:#4338ca;color:#fff">` +
    `<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">` +
    `<path d="M6 2h12a1 1 0 0 1 1 1v18l-7-4.2L5 21V3a1 1 0 0 1 1-1z"/></svg></div>`
  );
}

function linje(tekst: string, stil: string): HTMLParagraphElement {
  const p = document.createElement('p');
  p.textContent = tekst;
  p.setAttribute('style', stil);
  return p;
}

export function lagStedPopup(
  sted: StedForKart,
  tekster: StedPopupTekster,
  handlinger: { påFunnHer: () => void }
): HTMLElement {
  const rot = document.createElement('div');
  rot.setAttribute('style', 'min-width:170px;max-width:240px');

  rot.appendChild(linje(sted.name, 'margin:0;font-weight:700;font-size:14px;color:#111827'));

  if (sted.note) {
    rot.appendChild(linje(sted.note, 'margin:4px 0 0;font-size:12px;color:#374151;line-height:1.4'));
  }

  rot.appendChild(
    linje(
      `${sted.latitude.toFixed(5)}, ${sted.longitude.toFixed(5)}`,
      'margin:4px 0 0;font-size:11px;color:#6b7280'
    )
  );

  const knapp = document.createElement('button');
  knapp.type = 'button';
  knapp.textContent = tekster.funnHer;
  knapp.setAttribute(
    'style',
    'margin-top:8px;width:100%;border-radius:8px;background:#166534;color:#fff;' +
      'padding:6px 10px;font-size:12px;font-weight:600;border:0;cursor:pointer'
  );
  knapp.addEventListener('click', handlinger.påFunnHer);
  rot.appendChild(knapp);

  return rot;
}
