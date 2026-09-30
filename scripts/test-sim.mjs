// Bundles and runs the simulator calibration tests (no extra dependencies: uses the toolkit's esbuild).
import { build } from "esbuild";

const outfile = ".dt-app/test/calibration.mjs";
await build({
  entryPoints: ["ui/app/sim/__tests__/calibration.test.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  logLevel: "warning",
});
await import(new URL(`../${outfile}`, import.meta.url));
