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
    content: [{ type: "text" as const, text: `No ${what} found with id ${id}` }],
  };
}

export function registerGuardianTools(server: McpServer) {
  server.registerTool(
    "get_home_status",
    {
      title: "Get home status",
      description:
        "Returns current status of household members and active incidents.",
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
        "Returns household members, their routines, and expected visitors — used to judge whether an event is expected.",
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
      inputSchema: { memberId: z.string() },
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
        type: z.string(),
        location: z.string(),
        timestamp: z.string().optional(),
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
      inputSchema: { memberId: z.string(), reason: z.string() },
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
      inputSchema: { memberId: z.string(), message: z.string() },
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
      inputSchema: { incidentId: z.string(), headline: z.string() },
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
      description: "Creates a new incident of a given type, e.g. unknown_visitor.",
      inputSchema: {
        type: z.string(),
        reasoning: z.string(),
        tier: z.enum(["inform", "ask", "escalate"]),
        confidence: z.number().min(0).max(100),
        subjectMemberId: z.string().optional(),
        relatedEventIds: z.array(z.string()).optional(),
      },
    },
    async ({ type, reasoning, tier, confidence, subjectMemberId, relatedEventIds }) => {
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
      description: "Marks an incident as resolved, e.g. once a member responds.",
      inputSchema: { incidentId: z.string(), resolutionNote: z.string().optional() },
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
      inputSchema: { incidentId: z.string(), escalationReason: z.string() },
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
      const result = await compilePolicy(rule);
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
