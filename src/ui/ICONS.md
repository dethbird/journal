# App Icons and Favicon

## Setup

The app uses `logo-square.png` from `src/ui/src/assets/logo/` for all icons.

## Generated Icons

The following icons are generated from `logo-square.png`:

- `favicon.ico` - Browser favicon
- `favicon-16.png` - 16x16 favicon
- `favicon-32.png` - 32x32 favicon  
- `logo-180.png` - Apple touch icon (180x180)
- `logo-192.png` - Android icon (192x192)
- `logo-512.png` - Android icon (512x512)

## Regenerating Icons

After updating `logo-square.png`, run:

```bash
npm run ui:icons
```

Then rebuild the UI:

```bash
npm run ui:build
```

## PWA Support

The app includes a web manifest (`manifest.webmanifest`) that enables "install as app" functionality on mobile devices and compatible browsers.

## Note on Image Sizing

Currently, all icons are direct copies of the source image. For optimal quality, you should resize them to their target dimensions using:

- Online tools like https://realfavicongenerator.net
- ImageMagick: `convert logo-square.png -resize 192x192 logo-192.png`
- Any image editor

Target dimensions:
- favicon-16.png: 16x16
- favicon-32.png: 32x32
- logo-180.png: 180x180
- logo-192.png: 192x192
- logo-512.png: 512x512
- favicon.ico: multi-resolution (16x16, 32x32, 48x48)
