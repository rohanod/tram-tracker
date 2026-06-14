# tram-tracker

A private Lakebed capsule for saving tram vehicle numbers.

## Run locally

Create a server-only env file:

```sh
printf 'ALLOWED_EMAIL=you@example.com\n' > .env.lakebed.server
```

Then run the mirror watcher in one terminal:

```sh
node scripts/dev.mjs
```

And run Lakebed against that mirror in another terminal:

```sh
npx lakebed dev .lakebed/dev-capsule --port 3000
```

The app requires Google sign-in and only allows the email configured in `ALLOWED_EMAIL`.

The mirror watcher copies only `client/`, `server/`, `shared/`, `lakebed.json`, and `.env.lakebed.server` into `.lakebed/dev-capsule`. This avoids Lakebed dev rebuilding when `.git` metadata changes in the project root.

The dev mirror also disables PWA static endpoints and service-worker registration locally. The root capsule still serves the manifest/service worker/icon on deploy; this local-only transform avoids a Lakebed dev crash after static endpoint requests.

## What v1 does

- Saves 3-4 digit tram vehicle numbers.
- Uses current location plus Geneva local time to suggest a commute leg.
- Lets the leg be edited before saving and after saving.
- Stores entries in the Lakebed database and in IndexedDB on the device.
- Queues offline saves after the device has previously signed in online.
- Registers a manifest and service worker for installable PWA behavior.

Stats and unique vehicle summaries are intentionally out of scope for v1.

## Inspect local state

While `npx lakebed dev` is running:

```sh
npx lakebed db list --port 3000
npx lakebed db dump --port 3000
npx lakebed logs --port 3000
```
