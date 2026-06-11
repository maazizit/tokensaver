import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateCommandBreakdown,
  classifyShellCommand,
} from "./commandBreakdown";

describe("classifyShellCommand", () => {
  it("uses metadata commandType when present", () => {
    assert.equal(
      classifyShellCommand({ metadata: { commandType: "git diff" } }),
      "git diff"
    );
  });

  it("classifies from command string", () => {
    assert.equal(classifyShellCommand({ command: "git diff HEAD~1" }), "git diff");
    assert.equal(classifyShellCommand({ command: "cargo test -p core" }), "cargo test");
  });

  it("buckets unknown commands as other", () => {
    assert.equal(classifyShellCommand({ command: "echo hello" }), "other");
    assert.equal(classifyShellCommand({}), "other");
  });
});

describe("calculateCommandBreakdown", () => {
  it("aggregates per command with total row", () => {
    const rows = calculateCommandBreakdown([
      { command: "git diff", tokensRaw: 1000, tokensOptimized: 200, tokensSaved: 800 },
      { command: "git diff", tokensRaw: 500, tokensOptimized: 100, tokensSaved: 400 },
      { command: "cargo test", tokensRaw: 400, tokensOptimized: 50, tokensSaved: 350 },
      { command: "echo hi", tokensRaw: 20, tokensOptimized: 20, tokensSaved: 0 },
    ]);

    const git = rows.find((r) => r.command === "git diff");
    const cargo = rows.find((r) => r.command === "cargo test");
    const other = rows.find((r) => r.command === "other");
    const total = rows.find((r) => r.command === "TOTAL");

    assert.equal(git?.count, 2);
    assert.equal(git?.compressionPercent, 80);
    assert.equal(cargo?.compressionPercent, 87.5);
    assert.equal(other?.count, 1);
    assert.equal(other?.compressionPercent, 0);
    assert.equal(total?.count, 4);
    assert.equal(total?.compressionPercent, 80.7);
  });
});
