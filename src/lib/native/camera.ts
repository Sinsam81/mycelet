/**
 * Native photo capture via the Capacitor Camera plugin. Returns a File so the
 * result flows through the same pipeline as the web <input type="file">.
 * Returns null when the user backs out of the native picker. Only call this
 * when isNativePlatform() is true. The plugin is dynamically imported so its
 * web implementation is never evaluated during SSR.
 */
import { base64ToBlob } from '@/lib/utils/image';

export async function captureNativePhoto(): Promise<File | null> {
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
      promptLabelHeader: 'Legg til bilde',
      promptLabelPhoto: 'Velg fra bilder',
      promptLabelPicture: 'Ta bilde',
      promptLabelCancel: 'Avbryt'
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
