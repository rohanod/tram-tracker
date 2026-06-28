import { cp, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const stage = await mkdtemp(join(tmpdir(), "tram-tracker-lakebed-"));
const ignored = new Set([".git", ".lakebed", ".DS_Store", "stops.json", "sitg-tpg-lignes.geojson", "lines.json", "cdn"]);

try {
  await cp(root, stage, {
    recursive: true,
    filter: (source) => !ignored.has(source.split("/").pop() ?? "")
  });

  const result = spawnSync("npx", ["lakebed", "deploy"], {
    cwd: stage,
    stdio: "inherit"
  });

  process.exitCode = result.status ?? 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
