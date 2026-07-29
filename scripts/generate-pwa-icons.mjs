// Generates PWA PNG icons (192 + 512) for Android/Chrome installability,
// downscaled from the flattened 1024px brand icon used by the iOS app.
// Android Chrome's "Add to Home Screen" / beforeinstallprompt requires PNG
// icons at 192 and 512; SVG alone is unreliable across devices.
// Run: node scripts/generate-pwa-icons.mjs
import sharp from 'sharp';

const SRC = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'; // 1024px, flattened brand mushroom on green
const SIZES = [192, 512];

for (const size of SIZES) {
  const out = `public/icons/icon-${size}.png`;
  await sharp(SRC).resize(size, size, { fit: 'cover' }).png().toFile(out);
  console.log(`wrote ${out}`);
}
