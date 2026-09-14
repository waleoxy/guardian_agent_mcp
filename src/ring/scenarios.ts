/**
 * Pre-scripted Ring event scenarios for the Guardian simulator.
 *
 * Each scenario fires a sequence of events with realistic timing gaps.
 * delayMs is how long to wait *before* firing that event (0 = fire immediately).
 *
 * These map directly to the four scenarios in the Guardian design doc:
 *   A — Expected visitor (cleaner arrives in their Monday window)
 *   B — Owner away, unknown visitor (simple notify)
 *   C — Vulnerable member home, unknown visitor (wellness ask)
 *   D — Pattern escalation (3 unremarkable events in a short window)
 *
 * The timestamp override is used for time-sensitive scenarios (A, C) so
 * the decision engine sees the event at the right time of day regardless
 * of when you actually run the simulator.
 */

export interface ScenarioEvent {
  deviceId: string;
  eventType: string;
  location: string;
  delayMs: number;          // wait this long before firing
  timestampOverride?: string; // ISO string — forces a specific time of day
}

export interface Scenario {
  id: string;
  label: string;
  description: string;
  events: ScenarioEvent[];
}

// Helper: build an ISO timestamp for today at a specific hour:minute
function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

// Helper: next Monday at a specific hour:minute
function nextMondayAt(hour: number, minute = 0): string {
  const d = new Date();
  const daysUntilMonday = (1 + 7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysUntilMonday);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const SCENARIOS: Scenario[] = [
  {
    id: "scenario-a",
    label: "Scenario A — Expected Visitor (Cleaner, Monday window)",
    description:
      "Cleaner arrives at 10:30 on a Monday — inside their expected window. " +
      "Guardian should resolve this as tier:inform (no incident created).",
    events: [
      {
        deviceId: "ring-front-door",
        eventType: "person_detected",
        location: "front_door",
        delayMs: 0,
        timestampOverride: nextMondayAt(10, 30),
      },
    ],
  },
  {
    id: "scenario-b",
    label: "Scenario B — Unknown Visitor, Owner Away",
    description:
      "Unknown person at the front door at 8pm on a weekend. Owner is away. " +
      "Guardian should notify the owner (tier:inform or tier:ask).",
    events: [
      {
        deviceId: "ring-front-door",
        eventType: "person_detected",
        location: "front_door",
        delayMs: 0,
        timestampOverride: todayAt(20, 0),
      },
    ],
  },
  {
    id: "scenario-c",
    label: "Scenario C — Vulnerable Member Home, Unknown Visitor",
    description:
      "Unknown person at the front door mid-morning. Mary (vulnerable) is home. " +
      "Guardian should ask if she needs assistance (tier:ask).",
    events: [
      {
        deviceId: "ring-front-door",
        eventType: "person_detected",
        location: "front_door",
        delayMs: 0,
        timestampOverride: todayAt(10, 15),
      },
    ],
  },
  {
    id: "scenario-d",
    label: "Scenario D — Pattern Escalation (3 events, 10 min window)",
    description:
      "Three individually unremarkable events across different locations in " +
      "10 minutes. None alone would escalate. The cluster does. (tier:escalate)",
    events: [
      {
        deviceId: "ring-back-yard",
        eventType: "motion",
        location: "back_yard",
        delayMs: 0,
      },
      {
        deviceId: "ring-back-door",
        eventType: "door_activity",
        location: "back_door",
        delayMs: 3000, // 3 seconds in sim = represents 4 min gap
      },
      {
        deviceId: "ring-garage",
        eventType: "window_activity",
        location: "garage",
        delayMs: 3000, // another 3 seconds = represents 4 min gap
      },
    ],
  },
  {
    id: "scenario-doorbell",
    label: "Repeated Doorbell — 3 rings, no answer",
    description:
      "Someone rings the doorbell three times in quick succession. " +
      "Pattern detection should flag this as unusual.",
    events: [
      {
        deviceId: "ring-front-door",
        eventType: "doorbell",
        location: "front_door",
        delayMs: 0,
      },
      {
        deviceId: "ring-front-door",
        eventType: "doorbell",
        location: "front_door",
        delayMs: 2000,
      },
      {
        deviceId: "ring-front-door",
        eventType: "doorbell",
        location: "front_door",
        delayMs: 2000,
      },
    ],
  },
  {
    id: "scenario-package",
    label: "Package Detected at Front Door",
    description:
      "Delivery detected at the front door. Low-risk inform event.",
    events: [
      {
        deviceId: "ring-front-door",
        eventType: "package_detected",
        location: "front_door",
        delayMs: 0,
      },
    ],
  },
];
