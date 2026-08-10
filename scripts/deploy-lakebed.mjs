import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const stage = await mkdtemp(join(tmpdir(), "tram-tracker-lakebed-"));
const sourceEntries = ["client", "server", "shared", "lakebed.json"];

try {
  for (const entry of sourceEntries) {
    await cp(join(root, entry), join(stage, entry), { recursive: true });
  }
  try {
    await cp(join(root, ".env.lakebed.server"), join(stage, ".env.lakebed.server"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
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
