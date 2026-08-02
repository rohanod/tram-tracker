import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const stage = await mkdtemp(join(tmpdir(), "tram-tracker-lakebed-"));
const ignored = new Set([".git", ".lakebed", ".DS_Store", "stops.json", "sitg-tpg-lignes.geojson", "lines.json", "cdn", "new-data", "storage-data"]);

try {
  await cp(root, stage, {
    recursive: true,
    filter: (source) => !ignored.has(source.split("/").pop() ?? "")
  });
  await mkdir(join(stage, "storage-data"));
  await Promise.all([
    writeFile(join(stage, "storage-data/tpg-lines.info.json"), '{"generatedAt":"","lines":[]}'),
    writeFile(join(stage, "storage-data/tpg-routes.polyline.json"), '{"v":1,"precision":5,"features":[]}')
  ]);

  const result = spawnSync("npx", ["lakebed", "deploy"], {
    cwd: stage,
    stdio: "inherit"
  });

  process.exitCode = result.status ?? 1;
} finally {
  await rm(stage, { recursive: true, force: true });
}
