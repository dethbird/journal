#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Source and target paths
const sourceLogo = path.join(__dirname, 'src', 'assets', 'logo', 'logo-square.png');
const publicDir = path.join(__dirname, 'public');

// Ensure public directory exists
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Icon configurations
const icons = [
  { src: sourceLogo, dest: 'favicon.ico' },
  { src: sourceLogo, dest: 'favicon-16.png' },
  { src: sourceLogo, dest: 'favicon-32.png' },
  { src: sourceLogo, dest: 'logo-180.png' }, // Apple touch icon
  { src: sourceLogo, dest: 'logo-192.png' }, // Android
  { src: sourceLogo, dest: 'logo-512.png' }, // Android
];

console.log('Copying logo to public directory...');

// For now, just copy the source image to all target files
// In production, you'd want to resize these appropriately
icons.forEach(({ src, dest }) => {
  const targetPath = path.join(publicDir, dest);
  try {
    fs.copyFileSync(src, targetPath);
    console.log(`✓ Created ${dest}`);
  } catch (err) {
    console.error(`✗ Failed to create ${dest}:`, err.message);
  }
});

console.log('\nNote: All icons are copies of the source image.');
console.log('For optimal results, resize them to their target dimensions:');
console.log('  - favicon-16.png: 16x16');
console.log('  - favicon-32.png: 32x32');
console.log('  - logo-180.png: 180x180 (Apple touch icon)');
console.log('  - logo-192.png: 192x192 (Android)');
console.log('  - logo-512.png: 512x512 (Android)');
console.log('  - favicon.ico: 16x16, 32x32, 48x48 (multi-resolution .ico file)');
console.log('\nYou can use online tools like https://realfavicongenerator.net or ImageMagick for proper resizing.');
