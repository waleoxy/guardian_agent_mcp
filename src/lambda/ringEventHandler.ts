import type { EventBridgeEvent, Context } from "aws-lambda";
import { store } from "../store";
import { decide } from "../decide";

/**
 * Entry point for the event-driven path: Ring -> EventBridge -> this
 * Lambda -> Decision Engine -> store update. This is deliberately
 * separate from the MCP server (src/server.ts), which is Alexa+'s
 * synchronous request/response path. Ring events don't wait for a
 * voice turn, so they get their own asynchronous ingestion path that
 * happens to call the exact same `decide()` function.
 *
 * Expected EventBridge rule: source "guardian.ring", detail-type
 * "RingEvent", detail shaped like RingEventDetail below. Point your
 * Ring webhook (or Ring API poller) at a small adapter that
 * PutEvents's this shape onto the bus — see infra/eventbridge-rule.sh.
 */

export interface RingEventDetail {
  eventType: string; // e.g. "person_detected", "package_detected", "motion"
  location: string; // e.g. "front_door"
  deviceId?: string;
  timestamp?: string;
}

export async function handler(
  event: EventBridgeEvent<"RingEvent", RingEventDetail>,
  _context: Context,
): Promise<void> {
  const { eventType, location, timestamp } = event.detail;

  console.log("Guardian ingest: received Ring event", {
    eventType,
    location,
  });

  const monitoringActive = await store.getMonitoringActive();

  const householdEvent = await store.addEvent({
    source: "ring",
    type: eventType,
    location,
    timestamp,
  });

  if (!monitoringActive) {
    console.log("Monitoring is off — recording event, skipping reasoning.");
    return;
  }

  const decision = await decide(householdEvent);

  console.log("Guardian decision:", decision);

  if (decision.tier === "inform") {
    // Inform tier: act (log/notify) without creating a standing incident.
    return;
  }

  // "ask" and "escalate" tiers get a tracked incident so the
  // dashboard/Fire TV and any follow-up Alexa+ turn can reference it.
  await store.createIncident({
    type: eventType,
    status: decision.tier === "escalate" ? "escalated" : "awaiting_response",
    relatedEventIds: [householdEvent.id],
    reasoning: decision.reasoning,
    tier: decision.tier,
    confidence: decision.confidence,
  });
}
