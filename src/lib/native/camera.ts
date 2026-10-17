/**
 * Native photo capture via the Capacitor Camera plugin. Returns a File so the
 * result flows through the same pipeline as the web <input type="file">.
 * Returns null when the user backs out of the native picker. Only call this
 * when isNativePlatform() is true. The plugin is dynamically imported so its
 * web implementation is never evaluated during SSR.
 */
import { base64ToBlob } from '@/lib/utils/image';
import { DEFAULT_LOCALE, type Locale } from '@/i18n/config';

/**
 * Etikettene i den NATIVE bildevelgeren.
 *
 * Disse dukker opp i iOS' egen action sheet, altså utenfor React-treet —
 * next-intl rekker dem ikke, og de var derfor hardkodet norske i en app som
 * markedsføres og har grensesnitt på svensk. Samme mønster som COPY-tabellene
 * i prediksjonsbibliotekene: teksten bor ved siden av logikken, med nb som
 * standard slik at kallsteder uten locale oppfører seg som før.
 *
 * (Info.plist-tekstene — NSCameraUsageDescription og de tre andre — ligger
 * utenfor dette repoets TypeScript og må lokaliseres i Xcode med
 * ios/App/App/sv.lproj/InfoPlist.strings.)
 */
const PROMPT_COPY: Record<Locale, { header: string; photo: string; picture: string; cancel: string }> = {
  nb: {
    header: 'Legg til bilde',
    photo: 'Velg fra bilder',
    picture: 'Ta bilde',
    cancel: 'Avbryt'
  },
  sv: {
    header: 'Lägg till bild',
    photo: 'Välj från bilder',
    picture: 'Ta bild',
    cancel: 'Avbryt'
  }
};

/** Kjente avvisninger fra kamerapluginen, som siden skal forklare på leserens språk. */
export type KameraFeil = 'kamera-avslatt' | 'bilder-avslatt' | 'bilde-utilgjengelig';

/**
 * Pluginen avviser med faste engelske strenger (@capacitor/camera,
 * CameraPlugin.swift). Siden viste dem rått — «User denied access to photos»
 * — uten å si hva brukeren kan gjøre. Én «Ikke tillat» på dialogen står til den
 * endres i Innstillinger, og appen sa aldri fra. «Error loading image» kommer
 * typisk når originalen bare ligger i iCloud og ikke kan lastes ned.
 */
export function kameraFeil(feil: unknown): KameraFeil | null {
  const tekst = feil instanceof Error ? feil.message : typeof feil === 'string' ? feil : '';
  if (/denied access to camera/i.test(tekst)) return 'kamera-avslatt';
  if (/denied access to photos/i.test(tekst)) return 'bilder-avslatt';
  if (/error loading image/i.test(tekst)) return 'bilde-utilgjengelig';
  return null;
}

export async function captureNativePhoto(locale: Locale | string = DEFAULT_LOCALE): Promise<File | null> {
  const copy = PROMPT_COPY[locale as Locale] ?? PROMPT_COPY[DEFAULT_LOCALE];
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  let photo;
  try {
    photo = await Camera.getPhoto({
      quality: 90,
      // Base64, NOT Uri: the shell loads https://www.mycelet.com while file
      // URIs resolve to capacitor://localhost — fetching one from the page is
      // a cross-scheme request that CORS and the CSP's connect-src both block
      // (WebKit surfaces it as the bare «Load failed»). Base64 crosses the
      // bridge directly and never touches the network layer.
      resultType: CameraResultType.Base64,
      source: CameraSource.Prompt,
      correctOrientation: true,
      promptLabelHeader: copy.header,
      promptLabelPhoto: copy.photo,
      promptLabelPicture: copy.picture,
      promptLabelCancel: copy.cancel
    });
  } catch (err) {
    // The plugin throws (rather than returning empty) when the user cancels.
    const message = err instanceof Error ? err.message.toLowerCase() : '';
    if (message.includes('cancel')) return null;
    throw err;
  }

  if (!photo.base64String) return null;

  const ext = photo.format || 'jpeg';
  const blob = base64ToBlob(photo.base64String, `image/${ext}`);
  return new File([blob], `mycelet-${Date.now()}.${ext}`, { type: blob.type });
}
