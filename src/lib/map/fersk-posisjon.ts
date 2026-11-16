/**
 * «Der jeg står NÅ» — en posisjon som faktisk er målt nå.
 *
 * HVORFOR
 * «Legg til funn» lagret posisjonen kartet fikk da det ble åpnet. Den som åpnet
 * kartet på parkeringsplassen, gikk i førti minutter og trykket pluss ved
 * kantarellene, fikk funnet lagret på parkeringsplassen. Rettingen er å måle
 * på nytt i det skjemaet åpnes — men da må målingen også VÆRE ny.
 *
 * `watchPositionUntilAccurate` ber om `maximumAge: 0`, og i nettleseren og på
 * Android holder det. I iOS-skallet gjør det ikke det: @capacitor/geolocation
 * leser bare enableHighAccuracy og timeout der (GeolocationPlugin.swift), og
 * CoreLocation leverer som regel sin SIST KJENTE posisjon først, før radioen
 * har rukket å måle. Har telefonen ligget i lomma, er den sist kjente
 * posisjonen nettopp parkeringsplassen — med god nøyaktighet, så hjelperen sier
 * seg fornøyd med en gang og stopper. Uten sjekken under hadde rettingen altså
 * lagret samme gale sted som før, nå med en fersk-etikett på.
 *
 * Derfor leses tidsstempelet plattformen setter på hver måling. Bare på iOS:
 * der er hullet, og der kommer tidsstempel og Date.now() fra samme klokke. På
 * Android kan en GPS-måling bære satellittklokka, og en feilstilt enhetsklokke
 * ville fått hver måling til å se gammel ut — der gjør maximumAge jobben.
 *
 * Alt går gjennom den eksporterte hjelperen. Capacitor-tillegget røres aldri
 * her (se advarselen i useGeolocation.ts om proxyen som svarer på `then`).
 */

import { TILLATELSE_FRIST_MS, watchPositionUntilAccurate, type AccurateFix } from '@/lib/hooks/useGeolocation';
import { plattform } from '@/lib/native/platform';

/**
 * Eldre enn dette er ikke «nå». Femten sekunder er rundt tjue meter til fots —
 * mindre enn GPS-en selv usikrer under trær.
 */
export const FERSK_MAKS_ALDER_MS = 15_000;

/** Så mye får tidsstempelet ligge foran Date.now() (avrunding mellom native og JS). */
export const KLOKKESLINGRING_MS = 5_000;

/**
 * Vakthunden: skjemaet holder «Lagre» stengt og «Finn meg» viser «…» mens vi
 * leter, så letingen må ALLTID ta slutt — også om hjelperen under ikke gjør det.
 *
 * Den har to frister, fordi det er to ting å vente på:
 *
 *  - FØR letingen lastes modulen, og plattformen spør kanskje om tillatelse.
 *    Den dialogen besvares av et menneske (iOS spør på nytt etter «Tillat én
 *    gang»), og tiden det tar, skal ikke gå av letingens. Her gjelder
 *    TILLATELSE_FRIST_MS — samme tak som identifiseringen gir dialogen.
 *  - Når letingen ER i gang (hjelperen sier fra med onStart), har hjelperen
 *    sin egen frist, timeoutMs. Vakthunden ligger denne marginen bak den.
 *
 * Det var først én frist, regnet fra kallet. Brukte noen mer enn 13 sekunder
 * på dialogen i funnskjemaet (17 ved «Finn meg»), slo den til mens dialogen
 * sto oppe — og hjelperen, som ikke hørte avbrudd før letingen var startet,
 * lette videre mens hver måling ble kastet. Like etter «Tillat» sa skjemaet
 * «Fant ikke posisjonen din».
 */
export const VAKTHUND_MARGIN_MS = 5_000;

/**
 * Er målingen fra nå? Uten tidsstempel kan vi ikke dømme, og da stoler vi på
 * plattformen — ingen av dem vi støtter utelater det.
 */
export function erFerskMaaling(
  tidsstempel: number | undefined,
  naaMs: number,
  maksAlderMs: number = FERSK_MAKS_ALDER_MS
): boolean {
  if (typeof tidsstempel !== 'number' || !Number.isFinite(tidsstempel) || tidsstempel <= 0) return true;
  const alderMs = naaMs - tidsstempel;
  return alderMs >= -KLOKKESLINGRING_MS && alderMs <= maksAlderMs;
}

/**
 * iOS melder en ugyldig posisjon med negativ nøyaktighet. Hjelperen under tar
 * den laveste nøyaktigheten som «best», så en slik måling ville vunnet over
 * alle ekte.
 */
export function erGyldigMaaling(fix: { latitude: number; longitude: number; accuracy: number }): boolean {
  return (
    Number.isFinite(fix.latitude) &&
    Number.isFinite(fix.longitude) &&
    Math.abs(fix.latitude) <= 90 &&
    Math.abs(fix.longitude) <= 180 &&
    Number.isFinite(fix.accuracy) &&
    fix.accuracy >= 0
  );
}

export interface FerskPosisjonValg {
  /** Stopp så snart en fersk måling er minst så nøyaktig (meter). Standard 25. */
  targetAccuracyM?: number;
  /** Tak før vi gir oss med den beste ferske målingen så langt (ms). Standard 12 000. */
  timeoutMs?: number;
  /** Kalles for hver måling som er gyldig og fersk — aldri for den gamle. */
  onUpdate?: (fix: AccurateFix) => void;
  /** Avbryt letingen (skjemaet lukkes, nytt trykk på «Finn meg»). */
  signal?: AbortSignal;
  /** Klokka, så testene ikke avhenger av dagens. */
  naa?: () => number;
}

/** Har nettleseren alt sagt nei? Da er det ingen grunn til å vente ut fristen. */
async function nettleserenHarAvslaatt(): Promise<boolean> {
  if (plattform() !== 'web') return false;
  try {
    if (typeof navigator === 'undefined' || !navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'denied';
  } catch {
    // Eldre Safari kjenner ikke «geolocation» her. Da får selve letingen svare.
    return false;
  }
}

/**
 * Samme kontrakt som `watchPositionUntilAccurate` — løses med den beste
 * målingen, avvises når ingen kom eller letingen ble avbrutt — men bare målinger
 * som er gyldige og (på iOS) ferske teller. Den gamle, sist kjente posisjonen
 * blir verken meldt til `onUpdate`, valgt som best, eller grunn til å stoppe.
 */
export async function finnFerskPosisjon(valg: FerskPosisjonValg = {}): Promise<AccurateFix> {
  const { targetAccuracyM = 25, timeoutMs = 12_000, onUpdate, signal, naa = Date.now } = valg;

  if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');
  // Avslått i nettleseren: hjelperen venter ut hele fristen før den sier fra.
  // Skjemaet skal rett til kartsenteret, og «Finn meg» rett til beskjeden.
  if (await nettleserenHarAvslaatt()) throw new Error('Posisjonstilgang er avslått.');
  if (signal?.aborted) throw new Error('Posisjonssøk avbrutt.');

  const kreverFerskhet = plattform() === 'ios';
  // Egen avbryter: det er VI som avgjør når en måling er god nok. Hjelperen
  // ville stoppet på den første nøyaktige, også når den er den gamle.
  const egen = new AbortController();
  const vedAvbrudd = () => egen.abort();
  signal?.addEventListener('abort', vedAvbrudd);

  const funnet: { beste: AccurateFix | null; godNok: AccurateFix | null } = { beste: null, godNok: null };
  /** Letingen er over, uansett hvordan. Målinger som kommer etterpå, meldes ikke. */
  let avsluttet = false;

  // Vakthunden — se VAKTHUND_MARGIN_MS. Et løfte som bare kan avvises, og som
  // kappløper med hjelperen: slår den til, tar letingen slutt HER, uten å
  // vente på at hjelperen skal reagere på avbruddet.
  let vakthund: ReturnType<typeof setTimeout> | undefined;
  let slaaTil: () => void = () => {};
  const vakthundenSlo = new Promise<never>((_, avvis) => {
    slaaTil = () => {
      avvis(new Error('Fant ingen fersk posisjon i tide.'));
      egen.abort();
    };
  });
  const vokt = (fristMs: number) => {
    clearTimeout(vakthund);
    vakthund = setTimeout(slaaTil, fristMs);
  };
  vokt(TILLATELSE_FRIST_MS);

  try {
    await Promise.race([
      watchPositionUntilAccurate({
        // Aldri fornøyd av seg selv (ingen nøyaktighet er ≤ −∞), så letingen går
        // til vi stopper den eller fristen er ute.
        targetAccuracyM: Number.NEGATIVE_INFINITY,
        timeoutMs,
        signal: egen.signal,
        // Modulen er lastet og tillatelsen avklart: herfra teller letingens tid.
        onStart: () => {
          if (!avsluttet) vokt(timeoutMs + VAKTHUND_MARGIN_MS);
        },
        onUpdate: (fix) => {
          // Ikke `egen.signal.aborted`: den er også sann når vakthunden har
          // slått til, og var grunnen til at ferske målinger ble kastet.
          if (avsluttet || funnet.godNok || signal?.aborted) return;
          if (!erGyldigMaaling(fix)) return;
          if (kreverFerskhet && !erFerskMaaling(fix.timestamp, naa())) return;
          if (!funnet.beste || fix.accuracy < funnet.beste.accuracy) funnet.beste = fix;
          onUpdate?.(fix);
          if (fix.accuracy <= targetAccuracyM) {
            funnet.godNok = fix;
            egen.abort();
          }
        }
      }),
      vakthundenSlo
    ]);
  } catch (feil) {
    if (funnet.godNok) return funnet.godNok;
    // Kalleren avbrøt: da skal ingen posisjon ut, heller ikke en halvgod.
    if (signal?.aborted) throw feil;
    // Vakthunden slo til etter at ferske målinger var kommet inn.
    if (funnet.beste) return funnet.beste;
    throw feil;
  } finally {
    avsluttet = true;
    clearTimeout(vakthund);
    signal?.removeEventListener('abort', vedAvbrudd);
  }

  // Fristen gikk ut, og hjelperen svarte med SIN beste — som kan være den
  // gamle. Vår beste er bare ferske målinger.
  if (funnet.beste) return funnet.beste;
  throw new Error('Fant ingen fersk posisjon i tide.');
}
