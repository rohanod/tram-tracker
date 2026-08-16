# tram-tracker

A private Lakebed capsule for saving transit vehicle numbers.

## Server configuration

Define the allowed Google user and Shortcut token in `.env.lakebed.server`:

```sh
ALLOWED_USER_ID=google:your-user-id
SHORTCUT_TOKEN=your-secret-token
```

## Canonical transit data

Development and deployment always read exactly these generated files:

```text
/Users/rohan/Documents/tpg-line-data/out-data/tpg-lines.info.json
/Users/rohan/Documents/tpg-line-data/out-data/tpg-routes.polyline.json
/Users/rohan/Documents/tpg-line-data/out-data/tpg-stops.compact.json
```

`tpg-routes.geojson` is not read or staged. Run the generator in `tpg-line-data` before starting or deploying this app when the source data changes.

## Run locally

```sh
bun run dev
```

The wrapper copies only the three canonical transit files into `.lakebed/dev-capsule/storage-data`. This is a local filesystem copy; it does not upload or change production data. It also excludes Git metadata and disables PWA endpoints locally to avoid unnecessary Lakebed rebuilds.

## Deploy

```sh
bun run deploy
```

The wrapper validates the canonical files, compacts and gzips line metadata plus polyline geometry into the staged server, copies the compact stop index for Shortcut lookup, build-checks the staged capsule, and deploys it. Production transit updates require no maintenance page or Lakebed Storage upload.

Do not run `npx lakebed dev` or `npx lakebed deploy` from the repository root.

## What the app does

- Saves 3–4 digit transit vehicle numbers.
- Uses current location and transit geometry to suggest route context.
- Supports vehicle notes, review filters, statistics, and offline entry sync.
- Caches the latest deployed transit payload in IndexedDB for offline reloads.
- Exposes token-protected Shortcut save, lookup, and nearest-stop endpoints.
- Registers a manifest and service worker for installable PWA behavior.

## Inspect local state

While `bun run dev` is running:

```sh
npx lakebed db list --port 3000
npx lakebed db dump --port 3000
npx lakebed logs --port 3000
```
