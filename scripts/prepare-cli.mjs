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

// Track what we successfully bundled
let hasBundle = false;
let hasHooks = false;

if (existsSync(bundleSrc)) {
  copyFileSync(bundleSrc, join(bundledDir, "cli.bundle.mjs"));
  log("copied cli.bundle.mjs");
  hasBundle = true;
} else {
  log(`bundle not found at ${bundleSrc}`);
  // Check if we have a previously committed bundle
  const committedBundle = join(bundledDir, "cli.bundle.mjs");
  if (existsSync(committedBundle)) {
    log("using existing committed bundle");
    hasBundle = true;
  }
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
  hasHooks = true;
} else {
  log(`hooks not found at ${hooksSrc}`);
  // Check if we have previously committed hooks
  const committedHooks = join(bundledDir, "hooks");
  if (existsSync(committedHooks)) {
    log("using existing committed hooks");
    hasHooks = true;
  }
}

for (const asset of ["skills", "rules", "templates"]) {
  const src = join(tokvizRoot, asset);
  const dest = join(bundledDir, asset);
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    log(`copied ${asset}/`);
  }
}

// Validate that critical assets are present
if (!hasBundle) {
  console.error("FATAL: CLI bundle not found — extension cannot function without it");
  console.error("Expected: bundled/cli.bundle.mjs");
  process.exit(1);
}

if (!hasHooks) {
  console.error("FATAL: Hook scripts not found — extension cannot track tokens without them");
  console.error("Expected: bundled/hooks/");
  process.exit(1);
}

log("done — all required assets present");
