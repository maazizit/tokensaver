#!/usr/bin/env node
// Copies the bundled TokViz CLI and hook scripts from the sibling tok-viz repo
// into ./bundled so the extension ships a self-contained tracker.
//
// Run automatically before packaging (vscode:prepublish). If the sibling repo
// is unavailable (e.g. CI from a tarball), it silently keeps any existing
// committed assets in ./bundled.

import {
  existsSync,
  mkdirSync,
  copyFileSync,
  cpSync,
  readdirSync,
  chmodSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const extRoot = join(__dirname, "..");
const tokvizRoot = join(extRoot, "..", "tok-viz");
const bundledDir = join(extRoot, "bundled");

const bundleSrc = join(tokvizRoot, "packages", "cli", "dist", "cli.bundle.mjs");
const hooksSrc = join(tokvizRoot, "hooks");

function log(msg) {
  console.log(`[prepare-cli] ${msg}`);
}

if (!existsSync(tokvizRoot)) {
  log(`sibling tok-viz repo not found at ${tokvizRoot} — keeping existing bundled assets`);
  process.exit(0);
}

// Best-effort: rebuild the bundle if pnpm is available so we ship the latest CLI.
const pnpm = spawnSync("pnpm", ["--filter", "@tokviz/cli", "run", "bundle"], {
  cwd: tokvizRoot,
  stdio: "inherit",
});
if (pnpm.status !== 0) {
  log("could not rebuild bundle with pnpm — using existing dist if present");
}

mkdirSync(bundledDir, { recursive: true });

if (existsSync(bundleSrc)) {
  copyFileSync(bundleSrc, join(bundledDir, "cli.bundle.mjs"));
  log("copied cli.bundle.mjs");
} else {
  log(`bundle not found at ${bundleSrc}`);
}

if (existsSync(hooksSrc)) {
  const hooksDest = join(bundledDir, "hooks");
  cpSync(hooksSrc, hooksDest, { recursive: true });
  // Ensure hook scripts stay executable.
  for (const agent of readdirSync(hooksDest)) {
    const script = join(hooksDest, agent, "hook.sh");
    if (existsSync(script)) {
      try {
        chmodSync(script, 0o755);
      } catch {
        // chmod optional on Windows
      }
    }
  }
  log("copied hooks/");
} else {
  log(`hooks not found at ${hooksSrc}`);
}

log("done");
