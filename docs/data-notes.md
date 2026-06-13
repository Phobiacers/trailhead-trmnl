# Trailhead Data Notes

The catalog is intentionally small, explicit, and easy to review. Each trail record should carry enough structure for the TRMNL templates without becoming navigation data.

## Record schema

- `id`: stable lowercase identifier, prefixed with the state.
- `name`: trail display name.
- `region`: short region label.
- `difficulty`: integer from `1` to `10`.
- `length_mi`: route length in miles.
- `elevation_gain_ft`: approximate gain in feet.
- `season`: `start_month`, `end_month`, `label`, and `note`.
- `highlight`: one-line reason this trail is worth discovering.
- `obstacle`: marquee obstacle with `name`, `mile`, `position_pct`, `trace_x`, `trace_y`, and `blurb`.
- `route.path`: simplified SVG path in a `0 0 100 60` viewBox.
- `profile.points`: simplified SVG polyline points in a `0 0 100 48` viewBox.
- `tags`: short discovery labels.

## Curation checklist

- Verify access, seasonal gates, permits, and closures against the current land manager before publishing.
- Use public-domain or permissively licensed sources for geometry hints.
- Treat facts as facts, but write the highlights and obstacle blurbs yourself.
- Keep the route glyph schematic. TRMNL users should not mistake it for a navigable map.
- Prefer a smaller verified catalog over a large scraped catalog.

## Good source categories

- USFS and BLM Motor Vehicle Use Maps.
- National Park Service road condition and permit pages where applicable.
- OpenStreetMap ways with relevant OHV metadata, checked manually.
- Club route descriptions that grant permission or are used only as leads for your own verification.
- Your own GPX tracks simplified with Douglas-Peucker, then normalized into the SVG viewBox.
