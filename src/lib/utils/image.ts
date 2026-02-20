export async function optimizeImageForIdentification(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      reject(new Error('Kunne ikke initialisere canvas.'));
      return;
    }

    img.onload = () => {
      const maxDim = 1500;
      let { width, height } = img;

      if (width > maxDim || height > maxDim) {
        const ratio = Math.min(maxDim / width, maxDim / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      resolve(base64.split(',')[1]);
      URL.revokeObjectURL(img.src);
    };

    img.onerror = () => reject(new Error('Kunne ikke lese bilde.'));
    img.src = URL.createObjectURL(file);
  });
}

export async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Kunne ikke lese filen.'));
    reader.readAsDataURL(file);
  });
}
