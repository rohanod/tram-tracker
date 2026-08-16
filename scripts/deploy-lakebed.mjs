import { cp, mkdtemp, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { stageTransitData } from "./transit-data-source.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const stage = await mkdtemp(join(tmpdir(), "tram-tracker-lakebed-"));
const buildArtifact = join(tmpdir(), `tram-tracker-lakebed-check-${process.pid}.json`);
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
  const transit = await stageTransitData(stage, { fullClientData: false });
  console.log(`Staged transit data ${transit.version.slice(0, 12)} from canonical out-data files.`);

  const build = spawnSync("npx", ["lakebed", "build", stage, "--target", "anonymous", "--out", buildArtifact], {
    cwd: stage,
    stdio: "inherit"
  });
  if (build.error) throw build.error;
  if (build.status !== 0) {
    process.exitCode = build.status ?? 1;
  } else {
    const deploy = spawnSync("npx", ["lakebed", "deploy"], {
      cwd: stage,
      stdio: "inherit"
    });
    if (deploy.error) throw deploy.error;
    process.exitCode = deploy.status ?? 1;
  }
} finally {
  await Promise.all([
    rm(stage, { recursive: true, force: true }),
    rm(buildArtifact, { force: true })
  ]);
}
