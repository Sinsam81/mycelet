'use client';

import { useMutation } from '@tanstack/react-query';
import { IdentifyResultPayload } from '@/types/identify';

/**
 * Feil fra /api/identify, med rutens `code`, HTTP-statusen og om svaret var
 * rutens JSON bevart. Status og JSON-flagget skiller «ruta sa nei» fra
 * «forespørselen nådde aldri ruta» (Vercels 413/504 er HTML) i feilmeldingen
 * til Sentry — se src/lib/identifications/meld-feil.ts.
 *
 * Tre koder settes av KLIENTEN, når det aldri kom noe svar å lese en kode fra
 * (se sendIdentifisering). Skillet mellom dem er hva serveren kan ha rukket:
 *   • `upload_stalled` — opplastingen sto stille. Hele kroppen kom aldri
 *     fram, så ingenting er brukt, og et nytt forsøk er trygt.
 *   • `timeout`        — svaret kom ikke innen fristen.
 *   • `response_lost`  — hele kroppen var sendt, og forbindelsen røk før svaret.
 * Ved de to siste KAN serveren ha gjort hele jobben (kvoteenhet og kreditt
 * brukt, historikkraden skrevet). Siden skal da peke til historikken, ikke be
 * om et blindt nytt forsøk som koster én enhet til for samme sopp.
 */
export class IdentifyError extends Error {
  readonly code?: string;
  readonly status?: number;
  readonly json?: boolean;
  constructor(message: string, code?: string, status?: number, json?: boolean) {
    super(message);
    this.name = 'IdentifyError';
    this.code = code;
    this.status = status;
    this.json = json;
  }
}
import { trackEvent } from '@/lib/analytics';

/**
 * Klientens to frister. Ingen av dem er et tak på HELE kallet, og det er
 * poenget.
 *
 * Den første utgaven var ett tak på 75 s fra trykket, opplastingen medregnet.
 * Men serverens klokke (maxDuration 60 s) starter først når hele kroppen er
 * framme, og tre bilder (~2,2 MB) tar rundt 70 s på en opplink på
 * 0,25 Mbit/s — helt vanlig i skogen. Da skjedde ett av to: opplastingen
 * trengte over 75 s og ble kuttet på HVERT forsøk (tregt ble til umulig),
 * eller den ble ferdig rett før, ruta brukte kvoteenheten og Kindwise-
 * kreditten, og klienten kastet svaret og ba brukeren prøve igjen.
 *
 * Nå følger fristen FRAMDRIFTEN:
 *
 *   • IDENTIFY_STILLSTAND_MS — så lenge kan opplastingen stå uten at en eneste
 *     ny byte går ut. En treg opplasting som beveger seg, kuttes aldri.
 *   • IDENTIFY_SVARFRIST_MS — så lenge venter vi på svaret når hele kroppen er
 *     sendt. Godt over serverens 60 s, av to grunner: finnes det et oversatt
 *     svar fra ruta, skal det vinne — og nettleseren melder «sendt» når bytene
 *     er levert til nettverkslaget, ikke når de er framme. Det som da ligger i
 *     buffere, er fortsatt på vei: målt i Chromium mot en mottaker strupet til
 *     100 kB/s ble opplastingen meldt ferdig 18 s før serveren hadde siste
 *     byte. Fristen må romme den halen OG serverens 60 s — strammes den ned
 *     mot 60–70 s, er feilen over tilbake på trege linjer.
 *     Samme frist gjelder fra start for en nettleser som aldri melder
 *     framdrift: uten det signalet vet vi ikke om stillhet betyr stillstand,
 *     og da skal fristen bare fange en død forbindelse.
 *
 * Uten noen frist avviste kallet aldri, og «Analyserer bilde...» sto til
 * brukeren drepte appen. GPS-steget fikk frist i #284 av samme grunn.
 */
export const IDENTIFY_STILLSTAND_MS = 60_000;
export const IDENTIFY_SVARFRIST_MS = 150_000;

/**
 * Fyrer en tidtaker SÅ mye for sent, har siden sovet (låst skjerm, appen i
 * bakgrunnen): tidtakerne leveres i det den våkner, før nettverkshendelsene
 * som ventet i kø. Fristen sier da ingenting om forbindelsen.
 */
const SOVN_SLAKK_MS = 5_000;

/** Et HTTP-svar fra /api/identify, uansett status — tolkes av kalleren. */
export interface IdentifySvar {
  status: number;
  tekst: string;
}

/**
 * Sender kroppen til /api/identify og løser med svaret, uansett HTTP-status.
 *
 * XMLHttpRequest og ikke fetch, av én grunn: fetch kan ikke fortelle hvor
 * langt opplastingen er kommet (strømmet forespørselskropp finnes ikke i
 * Safari), og uten det kan en frist bare måle tid — ikke stillstand.
 *
 * Avviser med
 *   • IdentifyError `upload_stalled` | `timeout` | `response_lost` (se klassen)
 *   • TypeError når forbindelsen ryker FØR hele kroppen er sendt — samme type
 *     som fetch kastet, så siden viser samme «sjekk dekningen»-tekst som før.
 */
export function sendIdentifisering(kropp: string): Promise<IdentifySvar> {
  return new Promise<IdentifySvar>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    /** Har nettleseren meldt framdrift i opplastingen? Først da betyr stillhet stillstand. */
    let framdriftMeldt = false;
    /** Siste bytetall nettleseren meldte som sendt. */
    let sendt = 0;
    let opplastet = false;
    let ferdig = false;
    let frist: ReturnType<typeof setTimeout> | undefined;

    const avslutt = (utfall: () => void) => {
      if (ferdig) return;
      ferdig = true;
      clearTimeout(frist);
      utfall();
    };

    const settFrist = (ms: number) => {
      clearTimeout(frist);
      const satt = Date.now();
      frist = setTimeout(() => {
        // Siden har sovet — se SOVN_SLAKK_MS. Start fristen på nytt og la
        // hendelsene som ventet (framdrift, svaret, en brutt forbindelse)
        // komme først. Våken side: neste runde fyrer i tide.
        if (Date.now() - satt > ms + SOVN_SLAKK_MS) {
          settFrist(ms);
          return;
        }
        // Stillstand kan bare slås fast når nettleseren HAR meldt framdrift og
        // så sluttet. Ellers er det svaret vi ikke fikk, og da vet vi ikke hva
        // serveren rakk.
        const feil =
          !opplastet && framdriftMeldt
            ? new IdentifyError(`Opplastingen sto stille i ${ms / 1000} s etter ${sendt} byte`, 'upload_stalled')
            : new IdentifyError(
                opplastet
                  ? `Ingen svar ${ms / 1000} s etter at opplastingen var ferdig`
                  : `Ingen svar og ingen framdrift meldt på ${ms / 1000} s`,
                'timeout'
              );
        avslutt(() => reject(feil));
        xhr.abort();
      }, ms);
    };

    const opplastingFerdig = () => {
      if (opplastet || ferdig) return;
      opplastet = true;
      settFrist(IDENTIFY_SVARFRIST_MS);
    };

    // Lytterne på xhr.upload MÅ settes før send(): nettleseren avgjør der og
    // da om opplastingshendelser skal sendes i det hele tatt. Mangler
    // xhr.upload (en XMLHttpRequest som er byttet ut av et tillegg), står
    // svarfristen alene — tregere til å gi opp, men aldri en feil.
    //
    // addEventListener, ikke on-egenskapene: en lytter kan ikke overskrives av
    // annen kode som instrumenterer XMLHttpRequest (feilsporing, analyse).
    const opplasting: XMLHttpRequestUpload | undefined = xhr.upload;
    if (opplasting) {
      opplasting.addEventListener('progress', (hendelse) => {
        // Er hele kroppen først meldt sendt, går vi aldri tilbake: fra da av
        // kan serveren ha fått den, og utfallet skal ikke kunne bli
        // «bildene kom aldri fram».
        if (ferdig || opplastet) return;
        if (hendelse.lengthComputable && hendelse.loaded >= hendelse.total) {
          opplastingFerdig();
          return;
        }
        // Samme tall en gang til er ikke bevegelse, og skal ikke holde liv i
        // en opplasting som står. Et LAVERE tall er det: nettleseren sender
        // kroppen på nytt fordi forbindelsen den gjenbrukte, viste seg død.
        if (hendelse.loaded === sendt) return;
        sendt = hendelse.loaded;
        framdriftMeldt = true;
        settFrist(IDENTIFY_STILLSTAND_MS);
      });
      opplasting.addEventListener('load', opplastingFerdig);
    }

    xhr.addEventListener('load', () => avslutt(() => resolve({ status: xhr.status, tekst: xhr.responseText })));
    xhr.addEventListener('error', () =>
      avslutt(() =>
        reject(
          opplastet
            ? new IdentifyError('Forbindelsen røk etter at opplastingen var ferdig', 'response_lost')
            : new TypeError('Network request failed')
        )
      )
    );

    try {
      xhr.open('POST', '/api/identify');
      xhr.setRequestHeader('Content-Type', 'application/json');
      settFrist(IDENTIFY_SVARFRIST_MS);
      xhr.send(kropp);
    } catch (err) {
      avslutt(() => reject(err));
    }
  });
}

interface IdentifyRequest {
  /** Inntil tre bilder av SAMME sopp (hatt, underside, stilk), i visningsrekkefølge. */
  imagesBase64: string[];
  originalImageDataUrls: string[];
  latitude?: number;
  longitude?: number;
}

export function useIdentify() {
  return useMutation({
    mutationFn: async (payload: IdentifyRequest): Promise<IdentifyResultPayload> => {
      trackEvent('identify_started', {
        has_location: payload.latitude !== undefined && payload.longitude !== undefined,
        image_count: payload.imagesBase64.length
      });

      let svar: IdentifySvar;
      try {
        svar = await sendIdentifisering(
          JSON.stringify({
            images: payload.imagesBase64,
            latitude: payload.latitude,
            longitude: payload.longitude
          })
        );
      } catch (err) {
        // Klientens egne utfall har ingen HTTP-status. En brutt forbindelse
        // (TypeError) spores ikke her — den ble det heller ikke før.
        if (err instanceof IdentifyError) {
          trackEvent('identify_failed', { status: 0, code: err.code ?? 'ukjent' });
        }
        throw err;
      }

      // Plattformnivå-feil (f.eks. Vercels 413 når kroppen passerer 4,5 MB)
      // svarer med HTML, ikke rutens JSON-form — en ubetinget tolking ville
      // kastet SyntaxError og vist rå browser-engelsk for brukeren.
      let data: (Partial<IdentifyResultPayload> & { error?: string; code?: string }) | null = null;
      try {
        data = JSON.parse(svar.tekst);
      } catch {
        data = null;
      }
      const ok = svar.status >= 200 && svar.status < 300;
      if (!ok || data == null) {
        trackEvent('identify_failed', { status: svar.status, code: data?.code ?? 'ukjent' });
        // Koden må overleve kastet. Uten den måtte klienten gjenkjenne
        // tilstanden på selve feilteksten — og en oversatt tekst matcher ikke
        // en norsk delstreng, så AI-deaktivert-panelet ville forsvunnet for
        // svenske brukere i det serveren begynte å svare på deres språk.
        // Reserveteksten er IKKE brukertekst: når svaret ikke var rutens JSON
        // (json === false), velger siden en oversatt melding selv. Den står
        // her bare som feiltekst i Sentry.
        throw new IdentifyError(data?.error ?? 'Identifikasjon feilet', data?.code, svar.status, data != null);
      }

      trackEvent('identify_completed', {
        suggestion_count: Array.isArray(data.suggestions) ? data.suggestions.length : 0,
        is_plant: Boolean(data.isPlant)
      });

      return {
        // Historikkraden ruta nettopp skrev. null = ingen rad, og da skal
        // hverken bildeopplastingen eller funn-koblingen forsøkes.
        identificationId: (data as { identificationId?: string | null }).identificationId ?? null,
        historyImagePath: (data as { imagePath?: string | null }).imagePath ?? null,
        // Første bilde er hero-/funnfotoet; hele lista vises som stripe på
        // resultatsiden så brukeren SER hva som ble analysert.
        originalImageDataUrl: payload.originalImageDataUrls[0],
        originalImageDataUrls: payload.originalImageDataUrls,
        location: {
          latitude: payload.latitude ?? null,
          longitude: payload.longitude ?? null
        },
        suggestions: data.suggestions ?? [],
        isPlant: Boolean(data.isPlant),
        // Tre tilstander — alt annet enn et ekte boolsk svar er «ukjent».
        isMushroom: data.isMushroom === false ? false : data.isMushroom === true ? true : null,
        // Serveren setter dette når et oppslag av spiselighet eller
        // forvekslingsarter feilet. Da MÅ resultatsiden si fra — uten flagget
        // ser «vi klarte ikke sjekke» ut nøyaktig som «ingen fare funnet».
        safetyDataIncomplete: Boolean(data.safetyDataIncomplete),
        // «N igjen i dag»-hintet på resultatsiden. null = betalende/ukjent.
        freeQuotaRemaining:
          typeof (data as { freeQuotaRemaining?: unknown }).freeQuotaRemaining === 'number'
            ? ((data as { freeQuotaRemaining: number }).freeQuotaRemaining)
            : null
      };
    }
  });
}
