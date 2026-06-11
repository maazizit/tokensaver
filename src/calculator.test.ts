import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calculateCompressionSnapshot,
  calculateProjections,
  formatCurrency,
  formatTokenCount,
  PRICE_PER_1K_TOKENS,
} from "./calculator";

describe("calculateProjections", () => {
  it("returns zeros for empty events", () => {
    const result = calculateProjections([]);
    assert.equal(result.dailyTokens, 0);
    assert.equal(result.weeklyTokens, 0);
    assert.equal(result.monthlyTokens, 0);
    assert.equal(result.monthlyCostSavedUSD, 0);
  });

  it("ignores events from prior days", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = calculateProjections([
      { timestamp: yesterday.toISOString(), tokensSaved: 50_000 },
    ]);

    assert.equal(result.dailyTokens, 0);
    assert.equal(result.monthlyTokens, 0);
  });

  it("extrapolates from today's saved tokens", () => {
    const now = new Date().toISOString();
    const dailySaved = 14_600;

    const result = calculateProjections([
      { timestamp: now, tokensSaved: 10_000 },
      { timestamp: now, tokensSaved: 4_600 },
    ]);

    assert.equal(result.dailyTokens, dailySaved);
    assert.equal(result.weeklyTokens, dailySaved * 7);
    assert.equal(result.monthlyTokens, dailySaved * 30);
    assert.equal(
      result.monthlyCostSavedUSD,
      parseFloat(((dailySaved * 30) / 1000 * PRICE_PER_1K_TOKENS).toFixed(2))
    );
  });

  it("accepts legacy saved field", () => {
    const now = new Date().toISOString();
    const result = calculateProjections([{ timestamp: now, saved: 2_000 }]);
    assert.equal(result.dailyTokens, 2_000);
  });

  it("treats missing saved as zero", () => {
    const now = new Date().toISOString();
    const result = calculateProjections([{ timestamp: now }]);
    assert.equal(result.dailyTokens, 0);
  });
});

describe("calculateCompressionSnapshot", () => {
  it("sums raw and optimized for all events", () => {
    const result = calculateCompressionSnapshot([
      { timestamp: "2026-01-01T10:00:00Z", tokensRaw: 1000, tokensOptimized: 800, tokensSaved: 200 },
      { timestamp: "2026-01-02T10:00:00Z", tokensRaw: 500, tokensOptimized: 450, tokensSaved: 50 },
    ]);

    assert.equal(result.rawTokens, 1500);
    assert.equal(result.optimizedTokens, 1250);
    assert.equal(result.savedTokens, 250);
    assert.equal(result.compressionPercent, parseFloat(((250 / 1500) * 100).toFixed(1)));
    assert.equal(result.events, 2);
  });

  it("filters to today only when requested", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const result = calculateCompressionSnapshot(
      [
        { timestamp: new Date().toISOString(), tokensRaw: 200, tokensOptimized: 150, tokensSaved: 50 },
        {
          timestamp: yesterday.toISOString(),
          tokensRaw: 999,
          tokensOptimized: 1,
          tokensSaved: 998,
        },
      ],
      true
    );

    assert.equal(result.rawTokens, 200);
    assert.equal(result.optimizedTokens, 150);
    assert.equal(result.savedTokens, 50);
    assert.equal(result.events, 1);
  });
});

describe("formatTokenCount", () => {
  it("adds thousands separators", () => {
    assert.equal(formatTokenCount(14_600), "14,600");
    assert.equal(formatTokenCount(438_000), "438,000");
  });
});

describe("formatCurrency", () => {
  it("formats with two decimals", () => {
    assert.equal(formatCurrency(3.29), "$3.29");
    assert.equal(formatCurrency(0), "$0.00");
  });

  it("floors tiny positive amounts to $0.01", () => {
    assert.equal(formatCurrency(0.001), "$0.01");
    assert.equal(formatCurrency(0.009), "$0.01");
  });
});
