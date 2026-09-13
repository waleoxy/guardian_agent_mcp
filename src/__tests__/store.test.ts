import { describe, it, expect, vi } from "vitest";

/**
 * Regression test for a real bug: adding an explicit `timestamp`
 * override to the report_event tool's zod schema meant tools.ts's
 * `{ source, type, location, timestamp }` object literal always
 * creates an own `timestamp` property — `undefined` when the caller
 * doesn't supply one, but present nonetheless. In `addEvent`, the
 * object-spread order was `{ timestamp: computedDefault, ...input }`,
 * so that explicit `timestamp: undefined` silently overwrote the
 * computed default. Every event created without an explicit
 * timestamp ended up with none at all — which broke pattern
 * detection (Scenario D) since it filters by timestamp.
 *
 * decisionEngine.test.ts didn't catch this because every test there
 * passes an explicit real timestamp; this test exists specifically to
 * cover the "caller passes an object with timestamp: undefined in it"
 * case, which is what the real tool call path actually does.
 */
async function freshStore() {
  vi.resetModules();
  const { store } = await import("../store");
  return store;
}

describe("MemoryStore.addEvent — timestamp default", () => {
  it("assigns a real timestamp when none is passed at all", async () => {
    const store = await freshStore();
    const event = await store.addEvent({
      source: "ring",
      type: "motion",
      location: "garage",
    });
    expect(event.timestamp).toBeTruthy();
    expect(new Date(event.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("assigns a real timestamp even when the input object has an explicit timestamp: undefined property", async () => {
    // This is the exact shape tools.ts produces for report_event when
    // the caller omits the optional timestamp arg — `{ ...destructured }`
    // where one of the destructured fields is undefined still creates
    // an own property, which is different from the key being absent.
    const store = await freshStore();
    const inputWithExplicitUndefined = {
      source: "ring" as const,
      type: "motion",
      location: "garage",
      timestamp: undefined,
    };
    const event = await store.addEvent(inputWithExplicitUndefined);
    expect(event.timestamp).toBeTruthy();
    expect(new Date(event.timestamp).toString()).not.toBe("Invalid Date");
  });

  it("respects an explicit timestamp when one is provided", async () => {
    const store = await freshStore();
    const explicit = "2026-09-14T10:30:00.000Z";
    const event = await store.addEvent({
      source: "ring",
      type: "motion",
      location: "garage",
      timestamp: explicit,
    });
    expect(event.timestamp).toBe(explicit);
  });
});
