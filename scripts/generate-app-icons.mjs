// Generates the iOS app icon + splash from the Mycelet brand mark.
// Run: node scripts/generate-app-icons.mjs
// The icon is flattened (no alpha channel) because the App Store rejects icons
// with transparency. Splash is the mushroom glyph centered on the brand green.
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';

const GREEN_DARK = { r: 26, g: 52, b: 9 }; // #1A3409
const ICON_PATH = 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png';
const SPLASH_DIR = 'ios/App/App/Assets.xcassets/Splash.imageset';
const SPLASH_FILES = ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'];

// Full app icon: brand mushroom on a full-bleed green gradient square (iOS rounds the corners itself).
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0%" stop-color="#1A3409"/><stop offset="100%" stop-color="#3A6B1E"/>
  </linearGradient></defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <ellipse cx="256" cy="208" rx="150" ry="95" fill="#F5F0E8"/>
  <rect x="220" y="220" width="72" height="162" rx="30" fill="#EDE5D8"/>
  <ellipse cx="256" cy="210" rx="115" ry="60" fill="#FFFFFF"/>
  <circle cx="205" cy="210" r="10" fill="#E6A817"/>
  <circle cx="245" cy="185" r="11" fill="#E6A817"/>
  <circle cx="285" cy="205" r="9" fill="#E6A817"/>
</svg>`;

// Mushroom glyph only (transparent) for the splash composite.
const glyphSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <ellipse cx="256" cy="208" rx="150" ry="95" fill="#F5F0E8"/>
  <rect x="220" y="220" width="72" height="162" rx="30" fill="#EDE5D8"/>
  <ellipse cx="256" cy="210" rx="115" ry="60" fill="#FFFFFF"/>
  <circle cx="205" cy="210" r="10" fill="#E6A817"/>
  <circle cx="245" cy="185" r="11" fill="#E6A817"/>
  <circle cx="285" cy="205" r="9" fill="#E6A817"/>
</svg>`;

await sharp(Buffer.from(iconSvg), { density: 384 })
  .resize(1024, 1024)
  .flatten({ background: GREEN_DARK })
  .png()
  .toFile(ICON_PATH);

const glyph = await sharp(Buffer.from(glyphSvg), { density: 384 })
  .resize(1500, 1500, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

const splash = await sharp({
  create: { width: 2732, height: 2732, channels: 4, background: { ...GREEN_DARK, alpha: 1 } }
})
  .composite([{ input: glyph, gravity: 'center' }])
  .png()
  .toBuffer();

for (const file of SPLASH_FILES) {
  writeFileSync(`${SPLASH_DIR}/${file}`, splash);
}

console.log('Wrote app icon + 3 splash images.');
