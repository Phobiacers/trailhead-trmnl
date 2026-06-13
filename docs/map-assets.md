# Trailhead Map Assets

Trailhead's default layouts draw a custom topo-style map directly in Liquid/SVG. That keeps the plugin small, fast, and free from hosted image dependencies.

For a specific trail, you can also prepare a licensed source map image and convert it into TRMNL-friendly grayscale PNGs.

## Source Rights

Do not commit screenshots or map tiles from Google Maps, 4x4 Review, Trails Offroad, onX, or any other proprietary map product unless you have permission to republish them.

Good sources are:

- your own exported map artwork
- public-domain government map sources
- permissively licensed geodata or map renders
- images you commissioned or generated and have rights to publish

Keep raw/source files in `assets/maps/source/` or `assets/maps/raw/`. Those folders are ignored by git so source images do not get published accidentally.

## Convert A Map Image

```sh
npm run map:convert -- assets/maps/source/rubicon.png public/maps/rubicon --width 800 --height 480 --levels 16,4,2
```

The converter uses macOS `sips` to decode the source image, then creates ordered-dithered grayscale PNGs:

```text
public/maps/rubicon/rubicon-800x480-16gray.png
public/maps/rubicon/rubicon-800x480-4gray.png
public/maps/rubicon/rubicon-800x480-2gray.png
```

Use `--fit cover` for a full-bleed crop, or `--fit contain` when preserving the entire source image matters more than filling the frame.

## Suggested Sizes

- Full-screen TRMNL map plate: `800x480`
- Half-horizontal map plate: `800x240`
- Half-vertical map plate: `400x480`
- Quadrant map plate: `400x240`

The Liquid/SVG map remains the default because it works for every trail from catalog data alone. Raster assets are best for hand-curated hero trails where the source map image is legally clean and visually worth the extra maintenance.
