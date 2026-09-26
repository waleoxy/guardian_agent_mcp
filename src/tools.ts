import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { store } from "./store";
import { decide } from "./decide";
import { compilePolicy } from "./policyCompiler";

function text(payload: unknown) {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(payload, null, 2) },
    ],
  };
}

function notFound(what: string, id: string) {
  return {
    isError: true,
    content: [
      { type: "text" as const, text: `No ${what} found with id ${id}` },
    ],
  };
}

// Every household-member-taking tool shares this schema so the
// guidance (and the concrete IDs) only need to be written once. A
// voice user says "Mary," never "m-mary" — spelling out the known IDs
// directly, rather than just saying "look it up first," saves a
// round-trip tool call and removes a place a live agent can guess wrong.
const memberIdSchema = z
  .string()
  .describe(
    "The household member's internal id — 'm-john' (John, owner), 'm-mary' (Mary, parent), or 'm-james' (James, child) in this household. If a name is given that isn't one of these, call get_home_status first to check the current member list rather than guessing an id.",
  );

const incidentIdSchema = z
  .string()
  .describe(
    "An incident's id, as returned by create_incident, start_wellness_check, or get_home_status's activeIncidents list. Never guess this — call get_home_status first if you don't already have it from an earlier step in this conversation.",
  );

export function registerGuardianTools(server: McpServer) {
  server.registerTool(
    "get_home_status",
    {
      title: "Get home status",
      description:
        "The live status check — call this for any general 'how's the house / how's everything / what's going on at home' question. Returns whether monitoring is active, each household member's current status (home/away), and any active incidents needing attention right now. This is the right tool for a status check-in; use get_household_context instead only when you specifically need routines, expected-visitor schedules, or the list of safety policies.",
      inputSchema: {},
    },
    async () => {
      const [members, activeIncidents, monitoringActive] = await Promise.all([
        store.listMembers(),
        store.activeIncidents(),
        store.getMonitoringActive(),
      ]);
      return text({ monitoringActive, members, activeIncidents });
    },
  );

  server.registerTool(
    "get_recent_events",
    {
      title: "Get recent events",
      description: "Returns the most recent household events (default 10).",
      inputSchema: { limit: z.number().int().min(1).max(50).optional() },
    },
    async ({ limit }) => text(await store.recentEvents(limit ?? 10)),
  );

  server.registerTool(
    "get_household_context",
    {
      title: "Get household context",
      description:
        "Static household configuration — members' routines, expected-visitor schedules, and safety policies. Call this when the question is about rules, schedules, or setup (e.g. 'who's expected today', 'what are the safety rules'), not for a live status check — use get_home_status for 'how's the house right now' instead.",
      inputSchema: {},
    },
    async () => {
      const [members, expectedVisitors, policies] = await Promise.all([
        store.listMembers(),
        store.listVisitors(),
        store.listPolicies(),
      ]);
      return text({ members, expectedVisitors, policies });
    },
  );

  server.registerTool(
    "get_person_status",
    {
      title: "Get person status",
      description: "Returns the current status of a specific household member.",
      inputSchema: { memberId: memberIdSchema },
    },
    async ({ memberId }) => {
      const member = await store.getMember(memberId);
      if (!member) return notFound("member", memberId);
      return text(member);
    },
  );

  server.registerTool(
    "report_event",
    {
      title: "Report event",
      description:
        "Records a new household event (e.g. from Ring) and returns Guardian's decision about how to respond. This is the main entry point for the reasoning pipeline.",
      inputSchema: {
        source: z.enum(["ring", "manual", "system"]),
        type: z
          .string()
          .describe(
            "Event type, e.g. 'person_detected', 'door_activity', 'window_activity', 'motion', or 'no_response'.",
          ),
        location: z
          .string()
          .describe(
            "Where it happened, e.g. 'front_door', 'back_door', 'garage', 'side_yard'.",
          ),
        timestamp: z
          .string()
          .optional()
          .describe(
            "ISO timestamp override, for demo/testing control over day-of-week/time-sensitive scenarios (e.g. forcing an event into an expected visitor's window regardless of the actual current time). Defaults to now.",
          ),
      },
    },
    async ({ source, type, location, timestamp }) => {
      const event = await store.addEvent({ source, type, location, timestamp });
      const decision = await decide(event);
      return text({ event, decision });
    },
  );

  server.registerTool(
    "start_wellness_check",
    {
      title: "Start wellness check",
      description:
        "Begins a wellness-check workflow for a household member who hasn't responded or whose routine looks unusual.",
      inputSchema: { memberId: memberIdSchema, reason: z.string() },
    },
    async ({ memberId, reason }) => {
      const member = await store.getMember(memberId);
      const incident = await store.createIncident({
        type: "wellness_check",
        status: "awaiting_response",
        subjectMemberId: memberId,
        relatedEventIds: [],
        reasoning: reason,
        tier: "ask",
        confidence: 85,
      });
      return text({
        incident,
        message: member
          ? `Wellness check started for ${member.name}. Waiting for response.`
          : "Wellness check started. Waiting for response.",
      });
    },
  );

  server.registerTool(
    "notify_household_member",
    {
      title: "Notify household member",
      description: "Sends a notification to a household member (or the owner).",
      inputSchema: { memberId: memberIdSchema, message: z.string() },
    },
    async ({ memberId, message }) => {
      // Stub: production wires SNS/SES/push here. Logging + returning
      // the payload is enough for Alexa+ to speak a confirmation back.
      return text({ delivered: true, memberId, message });
    },
  );

  server.registerTool(
    "show_fire_tv_alert",
    {
      title: "Show Fire TV alert",
      description:
        "Pushes a status update to the Fire TV / dashboard display for a given incident.",
      inputSchema: { incidentId: incidentIdSchema, headline: z.string() },
    },
    async ({ incidentId, headline }) => {
      const incident = await store.getIncident(incidentId);
      if (!incident) return notFound("incident", incidentId);
      return text({ incidentId, headline, incident });
    },
  );

  server.registerTool(
    "create_incident",
    {
      title: "Create incident",
      description:
        "Creates a new incident of a given type, e.g. unknown_visitor.",
      inputSchema: {
        type: z.string(),
        reasoning: z.string(),
        tier: z.enum(["inform", "ask", "escalate"]),
        confidence: z.number().min(0).max(100),
        subjectMemberId: z.string().optional(),
        relatedEventIds: z.array(z.string()).optional(),
      },
    },
    async ({
      type,
      reasoning,
      tier,
      confidence,
      subjectMemberId,
      relatedEventIds,
    }) => {
      const incident = await store.createIncident({
        type,
        status: "open",
        subjectMemberId,
        relatedEventIds: relatedEventIds ?? [],
        reasoning,
        tier,
        confidence,
      });
      return text(incident);
    },
  );

  server.registerTool(
    "resolve_incident",
    {
      title: "Resolve incident",
      description:
        "Marks an incident as resolved, e.g. once a member responds.",
      inputSchema: {
        incidentId: incidentIdSchema,
        resolutionNote: z.string().optional(),
      },
    },
    async ({ incidentId, resolutionNote }) => {
      const existing = await store.getIncident(incidentId);
      const incident = await store.updateIncident(incidentId, {
        status: "resolved",
        reasoning: resolutionNote ?? existing?.reasoning,
      });
      if (!incident) return notFound("incident", incidentId);
      return text(incident);
    },
  );

  server.registerTool(
    "escalate_incident",
    {
      title: "Escalate incident",
      description:
        "Escalates an incident per a defined household policy (e.g. contact family, call emergency contact). Requires explicit policy authorization — Guardian never escalates unprompted.",
      inputSchema: {
        incidentId: incidentIdSchema,
        escalationReason: z.string(),
      },
    },
    async ({ incidentId, escalationReason }) => {
      const incident = await store.updateIncident(incidentId, {
        status: "escalated",
        reasoning: escalationReason,
      });
      if (!incident) return notFound("incident", incidentId);
      return text(incident);
    },
  );

  server.registerTool(
    "set_member_status",
    {
      title: "Set member status",
      description:
        "Updates a household member's presence status (home/away/unknown). This is what persists 'John left for work' or 'James is home early' across the whole system — the decision engine reads this status when evaluating every subsequent event.",
      inputSchema: {
        memberId: z.string(),
        status: z.enum(["home", "away", "unknown"]),
      },
    },
    async ({ memberId, status }) => {
      const member = await store.updateMember(memberId, { status });
      if (!member) return notFound("member", memberId);
      return text({ updated: true, member });
    },
  );

  server.registerTool(
    "set_monitoring",
    {
      title: "Set monitoring",
      description:
        "Activates or deactivates household monitoring — this is what 'Guardian, watch the house' triggers.",
      inputSchema: { active: z.boolean() },
    },
    async ({ active }) => {
      await store.setMonitoringActive(active);
      return text({ monitoringActive: active });
    },
  );

  server.registerTool(
    "add_policy",
    {
      title: "Add household policy from natural language",
      description:
        "Converts a plain-language safety rule (e.g. 'If Mom doesn't answer after two attempts, notify me') into a structured Guardian policy and saves it. This is how the owner teaches Guardian new rules by voice.",
      inputSchema: { rule: z.string() },
    },
    async ({ rule }) => {
      let result;
      try {
        result = await compilePolicy(rule);
      } catch (err: any) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Policy compiler threw unexpectedly: ${err?.message ?? err}`,
            },
          ],
        };
      }
      if (!result.ok) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `I couldn't turn that into a policy: ${result.error}`,
            },
          ],
        };
      }
      await store.addPolicy(result.policy);
      return text({
        saved: true,
        policy: result.policy,
        message: `Got it — saved as a ${result.policy.tier}-tier policy.`,
      });
    },
  );
}
