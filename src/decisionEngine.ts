import { store } from "./store";
import { Decision, HouseholdEvent, Policy } from "./types/domain";

/**
 * Rule-based decision engine. This is the safety-net implementation:
 * zero AWS dependency, deterministic, always available. Used directly
 * when DECISION_ENGINE=rules, and as the automatic fallback inside
 * bedrockDecisionEngine.ts when a live Bedrock call fails.
 */
export async function decide(event: HouseholdEvent): Promise<Decision> {
  const patternDecision = await checkPattern(event);
  if (patternDecision) return patternDecision;

  const expectedVisitorDecision = await checkExpectedVisitor(event);
  if (expectedVisitorDecision) return expectedVisitorDecision;

  const vulnerableMemberDecision = await checkVulnerableMemberHome(event);
  if (vulnerableMemberDecision) return vulnerableMemberDecision;

  const ownerAwayDecision = await checkOwnerAway(event);
  if (ownerAwayDecision) return ownerAwayDecision;

  const policies = await store.listPolicies();

  const matching = policies.find((p) => matches(p, event));
  if (matching) {
    const isHardConstraint = matching.notes?.includes("Hard constraint");
    return {
      tier: matching.tier,
      action: actionFor(matching.tier),
      reasoning: isHardConstraint
        ? `${event.type} at ${event.location} observed, with no context resolving whether it's expected. I won't unlock the door or take further action regardless of confidence — "${matching.description}" is a hard constraint. Just asking you before doing anything else.`
        : `${event.type} at ${event.location}. Applying policy: "${matching.description}"`,
      confidence: isHardConstraint ? 75 : 80,
      policyId: matching.id,
    };
  }

  // No specific policy matched. Prefer an explicit catch-all policy
  // (no eventType/location criteria — e.g. "don't wake the owner
  // unless it's urgent") over a hardcoded generic message, so the
  // owner's own stated default actually gets used and shown.
  const catchAll = policies.find(
    (p) => !p.appliesTo.eventType && !p.appliesTo.location,
  );
  if (catchAll) {
    return {
      tier: catchAll.tier,
      action: actionFor(catchAll.tier),
      reasoning: `${event.type} at ${event.location} doesn't match a specific policy. Falling back to: "${catchAll.description}"`,
      confidence: 60,
      policyId: catchAll.id,
    };
  }

  return {
    tier: "ask",
    action: "notify_owner",
    reasoning: `${event.type} at ${event.location} doesn't match any known policy. Defaulting to asking you before taking action.`,
    confidence: 55,
  };
}

/**
 * Scenario D from the design doc: no single event is alarming, but a
 * cluster of unusual events in a short window is. This runs before
 * per-event policy matching — a pattern match overrides what any
 * single event in it would otherwise trigger.
 *
 * Kept deliberately simple (count of distinct concerning event types
 * within a rolling window): the point is demonstrating that Guardian
 * reasons across events, not just about them individually. Tune
 * WINDOW_MS / THRESHOLD or swap for something smarter once you have
 * real event volume to calibrate against.
 */
const PATTERN_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const PATTERN_THRESHOLD = 3; // distinct concerning events in the window
const CONCERNING_TYPES = new Set([
  "person_detected",
  "door_activity",
  "window_activity",
  "motion",
]);

async function checkPattern(latest: HouseholdEvent): Promise<Decision | null> {
  if (!CONCERNING_TYPES.has(latest.type)) return null;

  const recent = await store.recentEvents(50);
  const latestTime = Date.parse(latest.timestamp);
  const windowStart = latestTime - PATTERN_WINDOW_MS;
  const inWindow = recent.filter((e) => {
    const t = Date.parse(e.timestamp);
    return CONCERNING_TYPES.has(e.type) && t >= windowStart && t <= latestTime;
  });

  if (inWindow.length < PATTERN_THRESHOLD) return null;

  const locations = [...new Set(inWindow.map((e) => e.location))];
  const types = [...new Set(inWindow.map((e) => e.type))];

  return {
    tier: "escalate",
    action: "escalate_pattern",
    reasoning: `${inWindow.length} unusual events (${types.join(", ")}) across ${locations.join(", ")} in the last ${Math.round(PATTERN_WINDOW_MS / 60000)} minutes. No single event was alarming on its own, but this pattern looks like a potential household incident — escalating rather than waiting for a clearer signal.`,
    confidence: 70,
  };
}

/**
 * Scenario A from the design doc: "It's the user's expected delivery
 * time" -> simple notify, no refusal framing needed. This was a real
 * gap, not just a missing nicety: without it, the hard-constraint
 * check below matches *any* person_detected event, so a scheduled
 * cleaner arriving in their usual window would incorrectly get the
 * same "I won't unlock the door" escalate response as a genuinely
 * unknown visitor. Checking expected-visitor context first is what
 * makes those two cases actually different, which is the whole point
 * of "context engine" in the design doc.
 *
 * Matches on day-of-week + time window only (not event type/location)
 * — a real implementation might also check the visitor is expected at
 * a specific entrance, but the domain model doesn't carry that today.
 */
const VISITOR_RELEVANT_TYPES = new Set(["person_detected", "door_activity"]);

async function checkExpectedVisitor(
  event: HouseholdEvent,
): Promise<Decision | null> {
  if (!VISITOR_RELEVANT_TYPES.has(event.type)) return null;

  const visitors = await store.listVisitors();
  const eventTime = new Date(event.timestamp);
  const dayOfWeek = eventTime.getDay();
  const hhmm = `${String(eventTime.getHours()).padStart(2, "0")}:${String(
    eventTime.getMinutes(),
  ).padStart(2, "0")}`;

  const match = visitors.find(
    (v) =>
      v.dayOfWeek === dayOfWeek &&
      hhmm >= v.timeWindowStart &&
      hhmm <= v.timeWindowEnd,
  );
  if (!match) return null;

  return {
    tier: "inform",
    action: "notify_owner_expected_visitor",
    reasoning: `${event.type} at ${event.location} — this matches the expected window for ${match.label}. Notifying you, no action needed.`,
    confidence: 90,
  };
}

function matches(policy: Policy, event: HouseholdEvent): boolean {
  const { eventType, location } = policy.appliesTo;
  if (!eventType && !location) return false; // catch-all: never auto-matches here, see decide()
  if (eventType && eventType !== event.type) return false;
  if (location && location !== event.location) return false;
  return true;
}

/**
 * Scenario C from the design doc: "elderly parent home" -> ask
 * whether assistance is needed, rather than a generic notify. Checked
 * before the away-owner case (B): in this seeded household Mary is
 * both vulnerable and marked "home", so with the seed data as-is, C
 * legitimately takes precedence over B for the same front-door event
 * — a deliberate product choice (a vulnerable person's situation is
 * more time-sensitive than a routine away-notification), not an
 * accident of ordering. checkOwnerAway is exported and independently
 * testable so B's own logic is still verified even though this
 * household's fixed seed data means C usually wins the race with it.
 */
const VULNERABLE_CHECK_TYPES = new Set(["person_detected", "door_activity"]);

export async function checkVulnerableMemberHome(
  event: HouseholdEvent,
): Promise<Decision | null> {
  if (!VULNERABLE_CHECK_TYPES.has(event.type)) return null;

  const members = await store.listMembers();
  const vulnerableHome = members.find(
    (m) => m.vulnerable && m.status === "home",
  );
  if (!vulnerableHome) return null;

  return {
    tier: "ask",
    action: "ask_whether_assistance_needed",
    reasoning: `${event.type} at ${event.location} while ${vulnerableHome.name} is home. Want me to check whether ${vulnerableHome.name} needs anything, or just keep monitoring? Either way, I won't unlock the door without your confirmation.`,
    confidence: 75,
  };
}

/**
 * Scenario B from the design doc: owner away, unknown visitor at the
 * door -> notify (+ Fire TV alert on the dashboard), explicitly *not*
 * an escalation. The doc's own demo transcript for this exact
 * situation is "I'll notify you and continue monitoring" — restrained,
 * not urgent — which is why this resolves to "inform", matching the
 * Bedrock engine's own system-prompt instruction to use "escalate"
 * sparingly rather than as the default for an ordinary unknown visitor.
 */
const AWAY_CHECK_TYPES = new Set(["person_detected", "door_activity"]);

export async function checkOwnerAway(
  event: HouseholdEvent,
): Promise<Decision | null> {
  if (!AWAY_CHECK_TYPES.has(event.type)) return null;

  const members = await store.listMembers();
  const ownerAway = members.some(
    (m) => m.role === "owner" && m.status === "away",
  );
  if (!ownerAway) return null;

  return {
    tier: "inform",
    action: "notify_owner_and_show_fire_tv_alert",
    reasoning: `${event.type} at ${event.location} while you're away. Notifying you now and showing it on the dashboard. I won't unlock the door or contact emergency services based on this alone — just monitoring.`,
    confidence: 80,
  };
}

function actionFor(tier: Decision["tier"]): string {
  if (tier === "inform") return "notify_owner";
  if (tier === "ask") return "request_confirmation";
  return "escalate_to_owner";
}
