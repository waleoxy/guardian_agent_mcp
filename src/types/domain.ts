export type ActionTier = "inform" | "ask" | "escalate";

export type PersonRole = "owner" | "parent" | "child" | "caregiver" | "other";

export interface HouseholdMember {
  id: string;
  name: string;
  role: PersonRole;
  /** Free-text routine description, e.g. "Usually away 8AM-6PM on weekdays" */
  routine?: string;
  /** Whether this person currently needs a wellness-check-style safety net */
  vulnerable: boolean;
  lastSeenAt?: string; // ISO timestamp
  status?: "home" | "away" | "unknown";
}

export interface ExpectedVisitor {
  id: string;
  label: string; // e.g. "Cleaner"
  dayOfWeek: number; // 0-6, Sunday = 0
  timeWindowStart: string; // "10:00"
  timeWindowEnd: string; // "11:00"
}

export interface HouseholdEvent {
  id: string;
  source: "ring" | "manual" | "system";
  type: string; // e.g. "person_detected", "package_detected", "door_activity"
  location: string; // e.g. "front_door"
  timestamp: string; // ISO
  raw?: Record<string, unknown>;
}

export interface Policy {
  id: string;
  description: string; // natural-language description, kept for display
  /** Structured condition, intentionally simple for v1 (no NL compiler yet) */
  appliesTo: {
    eventType?: string;
    location?: string;
  };
  tier: ActionTier;
  notes?: string;
}

export type IncidentStatus =
  | "open"
  | "awaiting_response"
  | "resolved"
  | "escalated";

export interface Incident {
  id: string;
  type: string; // e.g. "wellness_check", "unknown_visitor"
  status: IncidentStatus;
  subjectMemberId?: string; // who the incident concerns, if applicable
  relatedEventIds: string[];
  createdAt: string;
  updatedAt: string;
  reasoning?: string; // last decision-engine explanation, for the dashboard
  confidence?: number; // 0-100
  tier?: ActionTier;
}

export interface Decision {
  tier: ActionTier;
  action: string; // short label, e.g. "notify_owner", "no_action", "start_wellness_check"
  reasoning: string;
  confidence: number; // 0-100
  policyId?: string; // which policy drove this, if any
}
