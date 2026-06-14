import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const devRoot = join(root, ".lakebed", "dev-capsule");
const sourceEntries = ["client", "server", "shared", "lakebed.json", ".env.lakebed.server"];
const ignoredNames = new Set([".DS_Store", ".git", ".lakebed", "node_modules"]);

let lastFingerprint = "";
let copyInFlight = Promise.resolve();
let stopped = false;

console.log("Mirroring Lakebed capsule without .git into " + devRoot);
await mirrorSources({ reset: true });
lastFingerprint = await sourceFingerprint();
console.log("Mirror ready. In another terminal run:");
console.log("npx lakebed dev .lakebed/dev-capsule --port 3000");

const interval = setInterval(() => {
  void checkForChanges();
}, 500);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    stopped = true;
    clearInterval(interval);
  });
}

async function checkForChanges() {
  if (stopped) {
    return;
  }

  const nextFingerprint = await sourceFingerprint();
  if (nextFingerprint === lastFingerprint) {
    return;
  }

  lastFingerprint = nextFingerprint;
  copyInFlight = copyInFlight.then(() => mirrorSources({ reset: false }));
  await copyInFlight;
  console.log("Mirrored source changes at " + new Date().toLocaleTimeString());
}

async function mirrorSources({ reset }) {
  if (reset) {
    await rm(devRoot, { force: true, recursive: true });
  }

  await mkdir(devRoot, { recursive: true });
  for (const entry of sourceEntries) {
    await copyEntry(join(root, entry), join(devRoot, entry));
  }
}

async function copyEntry(sourcePath, targetPath) {
  let info;
  try {
    info = await stat(sourcePath);
  } catch {
    return;
  }

  const name = sourcePath.split("/").pop();
  if (ignoredNames.has(name)) {
    return;
  }

  if (info.isDirectory()) {
    await mkdir(targetPath, { recursive: true });
    const entries = await readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredNames.has(entry.name)) {
        continue;
      }
      await copyEntry(join(sourcePath, entry.name), join(targetPath, entry.name));
    }
    return;
  }

  if (!info.isFile()) {
    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  if (relative(root, sourcePath) === "server/index.ts") {
    await writeFile(targetPath, disablePwaEndpointsForDev(await readFile(sourcePath, "utf8")));
    return;
  }

  if (relative(root, sourcePath) === "client/index.tsx") {
    await writeFile(targetPath, disablePwaRegistrationForDev(await readFile(sourcePath, "utf8")));
    return;
  }

  await copyFile(sourcePath, targetPath);
}

async function sourceFingerprint() {
  const parts = [];
  for (const entry of sourceEntries) {
    await fingerprintEntry(join(root, entry), parts);
  }
  return parts.sort().join("\n");
}

async function fingerprintEntry(sourcePath, parts) {
  let info;
  try {
    info = await stat(sourcePath);
  } catch {
    return;
  }

  const name = sourcePath.split("/").pop();
  if (ignoredNames.has(name)) {
    return;
  }

  if (info.isDirectory()) {
    const entries = await readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      if (ignoredNames.has(entry.name)) {
        continue;
      }
      await fingerprintEntry(join(sourcePath, entry.name), parts);
    }
    return;
  }

  if (!info.isFile()) {
    return;
  }

  parts.push(relative(root, sourcePath) + ":" + info.size + ":" + info.mtimeMs);
}

function disablePwaEndpointsForDev(source) {
  const start = source.indexOf("\n  endpoints: {");
  if (start < 0) {
    return source;
  }

  const endMarker = "\n  }\n});";
  const end = source.indexOf(endMarker, start);
  if (end < 0) {
    return source;
  }

  return source.slice(0, start) + "\n  endpoints: {}\n});" + source.slice(end + endMarker.length);
}

function disablePwaRegistrationForDev(source) {
  return source.replace(
    "    installPwaAssets();",
    "    // Disabled in the dev mirror because Lakebed dev currently crashes after static endpoint requests.\n    // The root capsule still registers PWA assets for deploy."
  );
}
