import { describe, it, expect, vi } from "vitest";

/**
 * Each test gets a fresh module registry so the in-memory store's
 * seeded data (and any events a previous test added) never leaks
 * between tests — decide() reads from the singleton `store` module,
 * so re-importing after vi.resetModules() is what gives us isolation
 * without having to add a reset method to IGuardianStore just for tests.
 */
async function freshEngine() {
  vi.resetModules();
  const { decide } = await import("../decisionEngine");
  const { store } = await import("../store");
  return { decide, store };
}

// Sept 12, 2026 is a Saturday — no expected visitor is scheduled that
// day, which is what makes it a safe "definitely not expected" anchor
// for tests that need an unambiguous unknown-visitor case.
const SATURDAY_EVENING = new Date(2026, 8, 12, 20, 0);
// Sept 14, 2026 is the Monday in the same week — matches the seeded
// cleaner's window (10:00-11:00).
const MONDAY_MORNING = new Date(2026, 8, 14, 10, 30);

describe("decisionEngine — Scenario A: expected visitor", () => {
  it("informs, without refusal framing, when the event matches an expected visitor's window", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "e1",
      source: "ring",
      type: "person_detected",
      location: "front_door",
      timestamp: MONDAY_MORNING.toISOString(),
    });
    expect(decision.tier).toBe("inform");
    expect(decision.reasoning).toMatch(/Cleaner/);
    expect(decision.reasoning).not.toMatch(/hard constraint|won't take an unsafe action/i);
  });
});

describe("decisionEngine — Demo B: unexpected visitor, hard constraint", () => {
  it("escalates and cites the never-auto-unlock hard constraint for a genuinely unknown visitor", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "e2",
      source: "ring",
      type: "person_detected",
      location: "front_door",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("escalate");
    expect(decision.confidence).toBeGreaterThanOrEqual(90);
    expect(decision.reasoning).toMatch(/hard constraint/i);
  });

  it("does not let any decision engine propose unlocking regardless of confidence", async () => {
    // Regression guard for the bug this test suite exists to catch:
    // the hard constraint must fire for ANY person_detected event
    // that isn't resolved as an expected visitor first, not just the
    // specific one this suite happens to exercise.
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "e3",
      source: "ring",
      type: "person_detected",
      location: "back_door", // different location than the seeded policy's front_door
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.action).not.toMatch(/unlock/i);
    expect(decision.tier).toBe("escalate");
  });
});

describe("decisionEngine — fallback to the household's own default policy", () => {
  it("uses the owner's stated catch-all policy instead of a hardcoded message", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "e4",
      source: "system",
      type: "package_detected", // matches no specific policy
      location: "porch",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("ask");
    expect(decision.reasoning).toMatch(/urgent/i);
  });
});

describe("decisionEngine — Scenario D: pattern escalation", () => {
  it("escalates on a cluster of unrelated unusual events even though none alone would", async () => {
    const { decide, store } = await freshEngine();
    const base = new Date(2026, 8, 12, 22, 0).getTime();
    const mk = (offsetMin: number, type: string, location: string) => ({
      source: "ring" as const,
      type,
      location,
      timestamp: new Date(base + offsetMin * 60_000).toISOString(),
    });

    const e1 = await store.addEvent(mk(0, "motion", "side_yard"));
    const e2 = await store.addEvent(mk(2, "door_activity", "back_door"));
    const e3 = await store.addEvent(mk(4, "window_activity", "garage"));

    const d1 = await decide(e1);
    const d3 = await decide(e3);

    expect(d1.tier).not.toBe("escalate");
    expect(d3.tier).toBe("escalate");
    expect(d3.reasoning).toMatch(/pattern|3 unusual events/i);
    void e2;
  });

  it("does not escalate below the threshold", async () => {
    const { decide, store } = await freshEngine();
    const base = new Date(2026, 8, 12, 22, 0).getTime();
    const e1 = await store.addEvent({
      source: "ring",
      type: "motion",
      location: "side_yard",
      timestamp: new Date(base).toISOString(),
    });
    const e2 = await store.addEvent({
      source: "ring",
      type: "door_activity",
      location: "back_door",
      timestamp: new Date(base + 2 * 60_000).toISOString(),
    });
    const d2 = await decide(e2);
    expect(d2.tier).not.toBe("escalate");
    void e1;
  });
});
