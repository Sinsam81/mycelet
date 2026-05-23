/**
 * Native photo capture via the Capacitor Camera plugin. Returns a File so the
 * result flows through the same pipeline as the web <input type="file">.
 * Returns null when the user backs out of the native picker. Only call this
 * when isNativePlatform() is true. The plugin is dynamically imported so its
 * web implementation is never evaluated during SSR.
 */
export async function captureNativePhoto(): Promise<File | null> {
  const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');

  let photo;
  try {
    photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.Uri,
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

  if (!photo.webPath) return null;

  const response = await fetch(photo.webPath);
  const blob = await response.blob();
  const ext = photo.format || 'jpeg';
  return new File([blob], `mycelet-${Date.now()}.${ext}`, {
    type: blob.type || `image/${ext}`
  });
}
