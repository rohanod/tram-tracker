# Trip Entry Database Migration Plan

## Decision

The 10m nearest-stop threshold is a behavior change, not a database migration. Existing `nearestStopName` values stay unchanged. Do not reclassify historical rows: the current schema cannot distinguish a manually typed stop from an auto-detected stop.

## Target Data Shape

Add these fields before any historical stop correction:

- `schemaVersion`: row format version.
- `savedStopSource`: `manual`, `detected`, or `legacy_unknown`.
- `stopDetectionRadiusMeters`: radius used for a detected stop.
- `locationAccuracyMeters`: browser accuracy reported when location was captured.

Keep `nearestStopName`, `savedLeg`, and `inferredLeg` during the compatibility window. If they are renamed later, add `savedStopName`, `savedDirection`, and `inferredDirection` first and dual-read/dual-write them.

## Release Sequence

1. Export production before changing the schema:
   `npx lakebed db export <deploy-id-or-url> --out /private/tmp/tram-tracker-before-v2.json`
2. Deploy additive fields with defaults. Keep all existing fields and indexes. Lakebed retains rows and backfills declared indexes during schema activation.
3. New writes set `schemaVersion=2`, `savedStopSource`, the 10m radius for detected stops, and captured location accuracy. Manual stop text remains manual.
4. Client IndexedDB reads missing fields as `legacy_unknown`. Normalize records idempotently on startup; do not enqueue a sync solely to add metadata.
5. Backfill only deterministic fields in bounded, idempotent batches. Legacy stop text remains `legacy_unknown`; never clear or recompute it.
6. Verify row count, unique `clientEntryId`, owner assignment, pending sync queue, and a sample of manual/detected stops before switching reads to the new fields.
7. Remove legacy fields only in a later deploy after every active client dual-writes v2 and a second export has been taken.

## Rollback

During the compatibility deploy, old fields remain authoritative, so rollback is a code deploy rather than a data restore. If a backfill changes unexpected rows, stop the migration and restore from the pre-migration export before removing any legacy fields.

## Validation

- `npx lakebed db dump <deploy-id-or-url>` before and after each phase.
- Compare table counts and sample rows against the export.
- Test create, edit, offline create, sync, delete, shortcut save, and shortcut lookup.
- Run `node --test tests/tram.test.mjs`, Lakebed build, and `git diff --check`.
