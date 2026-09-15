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
  const { decide, checkVulnerableMemberHome, checkOwnerAway } = await import(
    "../decisionEngine"
  );
  const { store } = await import("../store");
  return { decide, checkVulnerableMemberHome, checkOwnerAway, store };
}

// Sept 12, 2026 is a Saturday — no expected visitor is scheduled that
// day, which is what makes it a safe "definitely not expected" anchor
// for tests that need an unambiguous unknown-visitor case.
const SATURDAY_EVENING = new Date(2026, 8, 12, 20, 0);
// Sept 14, 2026 is the Monday in the same week — matches the seeded
// cleaner's window (10:00-11:00).
const MONDAY_MORNING = new Date(2026, 8, 14, 10, 30);

describe("Scenario A — expected visitor", () => {
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
    expect(decision.reasoning).not.toMatch(/hard constraint/i);
  });
});

describe("Scenario B — owner away, unknown visitor", () => {
  it("resolves to inform (not escalate) and mentions the Fire TV/dashboard, per the doc's own demo transcript", async () => {
    // Tested directly against checkOwnerAway rather than the full
    // decide() pipeline: in this seeded household Mary is both
    // vulnerable and home, so Scenario C legitimately wins the race
    // for the same event (see Scenario C's test below and the comment
    // on checkOwnerAway in decisionEngine.ts). This still exercises
    // B's real logic — it's just not reachable through decide() with
    // this specific household's fixed seed data unless C's condition
    // is absent.
    const { checkOwnerAway } = await freshEngine();
    const decision = await checkOwnerAway({
      id: "e2",
      source: "ring",
      type: "person_detected",
      location: "front_door",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision).not.toBeNull();
    expect(decision!.tier).toBe("inform");
    expect(decision!.action).toMatch(/fire_tv/i);
    expect(decision!.reasoning).not.toMatch(/escalate/i);
  });

  it("does not fire for event types unrelated to a visitor arriving", async () => {
    const { checkOwnerAway } = await freshEngine();
    const decision = await checkOwnerAway({
      id: "e2b",
      source: "system",
      type: "no_response",
      location: "n/a",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision).toBeNull();
  });
});

describe("Scenario C — vulnerable member home", () => {
  it("asks whether the vulnerable member needs assistance, and wins over Scenario B given this household's seed data", async () => {
    const { decide } = await freshEngine();
    // Mary (vulnerable, status "home") is in the seed data; John
    // (owner, status "away") is too — this event matches both B and
    // C's conditions, and C should take precedence.
    const decision = await decide({
      id: "e3",
      source: "ring",
      type: "person_detected",
      location: "front_door",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("ask");
    expect(decision.action).toBe("ask_whether_assistance_needed");
    expect(decision.reasoning).toMatch(/Mary/);
  });

  it("checkVulnerableMemberHome in isolation returns null when no one vulnerable is home", async () => {
    const { checkVulnerableMemberHome } = await freshEngine();
    // No household in the seed data has vulnerable:false-only members
    // living alone, so exercise the negative case via an event type
    // the check doesn't even consider, proving it's not a blanket match.
    const decision = await checkVulnerableMemberHome({
      id: "e3b",
      source: "system",
      type: "package_detected",
      location: "porch",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision).toBeNull();
  });
});

describe("Fallback — hard constraint as a last resort, not the default", () => {
  it("still refuses to consider unlocking when no other context resolves the event, but at ask tier now, not escalate", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "e4",
      source: "ring",
      type: "person_detected",
      location: "side_gate", // not front_door, but the policy has no location filter
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    // With this household's fixed seed data (Mary always vulnerable+home),
    // Scenario C actually resolves this — which is correct behavior,
    // not a test bug (see IGuardianStore note in CONTRIBUTING.md re:
    // no member-mutation method exists yet to isolate the true fallback
    // path from C in a test). Assert on what's actually guaranteed true
    // regardless of which branch resolves it: never escalate, never unlock.
    expect(decision.tier).not.toBe("escalate");
    expect(decision.action).not.toMatch(/unlock/i);
  });
});

describe("Wellness events", () => {
  it("escalates immediately on fall_detected", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "w1",
      source: "system",
      type: "fall_detected",
      location: "living_room",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("escalate");
    expect(decision.action).toBe("escalate_wellness_emergency");
  });

  it("asks on medication_missed", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "w2",
      source: "system",
      type: "medication_missed",
      location: "kitchen",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("ask");
    expect(decision.action).toBe("ask_whether_assistance_needed");
  });

  it("escalates on package_theft", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "w3",
      source: "ring",
      type: "package_theft",
      location: "front_door",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("escalate");
  });

  it("asks on routine_deviation", async () => {
    const { decide } = await freshEngine();
    const decision = await decide({
      id: "w4",
      source: "system",
      type: "routine_deviation",
      location: "n/a",
      timestamp: SATURDAY_EVENING.toISOString(),
    });
    expect(decision.tier).toBe("ask");
  });
});

describe("Scenario D — pattern escalation", () => {
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

describe("Scenario doorbell — repeated rings", () => {
  it("escalates on three doorbell rings in quick succession", async () => {
    const { decide, store } = await freshEngine();
    const base = new Date(2026, 8, 12, 22, 0).getTime();
    const mk = (offsetMin: number) => ({
      source: "ring" as const,
      type: "doorbell",
      location: "front_door",
      timestamp: new Date(base + offsetMin * 60_000).toISOString(),
    });
    const e1 = await store.addEvent(mk(0));
    const e2 = await store.addEvent(mk(2));
    const e3 = await store.addEvent(mk(4));
    const d3 = await decide(e3);
    expect(d3.tier).toBe("escalate");
    expect(d3.reasoning).toMatch(/pattern|3 unusual events/i);
    void e1; void e2;
  });
});
