# Vehicle Tracker Implementation Notes

The running app is the design source of truth. Do not use the retired Figma file.

## Transit data

- `/Users/rohan/Documents/tpg-line-data/out-data` is the only source of truth.
- Use exactly `tpg-lines.info.json`, `tpg-routes.polyline.json`, and `tpg-stops.compact.json`; GeoJSON is not part of this app workflow.
- `bun run dev` copies those files into the local capsule only. It never uploads or changes production data.
- `bun run deploy` validates them, stages metadata/geometry placeholders, and imports the compact stop index as a Shortcut fallback without embedding the large transit payload.
- Production reads the active metadata and geometry URLs from the authenticated `transitData` query, validates both Storage objects, and caches them in IndexedDB for offline use.
- `/upload-data` is an allowlisted maintenance page. It uploads metadata and polyline geometry to public Lakebed Storage, activates the compact stop index, and deletes superseded objects only after activation succeeds.
- Metadata includes every available transit mode and line. Never filter the catalog to tram lines.
- Runtime line selectors, filters, colors, directions, stops, and geometry all come from this metadata.
- The app automatically chooses black or white line-pill text when the source foreground does not meet contrast.
- Default quick-access lines are ordered `14`, `18`, `12`, `17`; settings allow zero to four unique official lines.
- Replacing active transit data requires regenerating `tpg-line-data/out-data`, then selecting the exact three canonical files in `/upload-data`; run `bun run deploy` only when application code or the bundled Shortcut fallback changes.

## Shortcuts

- Shortcuts embed only the compact official line-to-headsign dictionary in `shortcut-line-metadata.cherri`.
- Rebuild it with `/usr/local/bin/bun scripts/build-shortcut-line-metadata.mjs` after metadata changes.
- Do not embed stops, coordinates, or route geometry in a shortcut.
- Typed shortcut lines must exist in the embedded dictionary before save.

## UI

- One search-first screen. `Save new` opens a dialog or mobile bottom sheet.
- Desktop uses a table; mobile uses cards. Both share search, filter, sort, pagination, and entry dialogs.
- Live search covers vehicle, line, direction, and saved place.
- Desktop filters stay visible. Mobile filters use a bottom sheet.
- Date filters use one two-month range popover in `client/filter-controls.tsx`, following the shadcn Base date-range interaction without adding its dependencies.
- Selects retain native semantics but use the shared app shell and custom chevron.
- Line choices always use official colors and accessible foregrounds.
- The entry form's `Other` line picker excludes the current default lines; settings still expose every official line.
- Location is requested only after `Detect location` is pressed. Keep its button separate from the readonly place field.
- Keep the compact black-and-white utility design, restrained radii, stable skeletons, and no decorative animation.
- Preserve `prefers-reduced-motion`, focus trapping/restoration, accessible names, and live status announcements.

## Validation

```sh
/usr/local/bin/bun test tests/tram.test.mjs
npm_config_cache=/private/tmp/tram-tracker-npm-cache npx lakebed build --out /private/tmp/tram-tracker-build --json
git diff --check
```
