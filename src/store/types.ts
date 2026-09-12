import {
  HouseholdMember,
  ExpectedVisitor,
  HouseholdEvent,
  Policy,
  Incident,
} from "../types/domain";

export type NewEventInput = Omit<HouseholdEvent, "id" | "timestamp"> & {
  timestamp?: string;
};

export type NewIncidentInput = Omit<Incident, "id" | "createdAt" | "updatedAt">;

/**
 * Every storage backend (in-memory for local/demo dev, DynamoDB for
 * production) implements this. Everything else in the codebase —
 * decision engines, MCP tools — talks to this interface only, never
 * to a concrete backend. That's what makes the DynamoDB swap a
 * one-file change instead of a rewrite.
 */
export interface IGuardianStore {
  listMembers(): Promise<HouseholdMember[]>;
  getMember(id: string): Promise<HouseholdMember | undefined>;

  listVisitors(): Promise<ExpectedVisitor[]>;

  listPolicies(): Promise<Policy[]>;
  addPolicy(policy: Policy): Promise<Policy>;

  addEvent(input: NewEventInput): Promise<HouseholdEvent>;
  recentEvents(limit: number): Promise<HouseholdEvent[]>;

  createIncident(input: NewIncidentInput): Promise<Incident>;
  updateIncident(
    id: string,
    patch: Partial<Incident>,
  ): Promise<Incident | undefined>;
  getIncident(id: string): Promise<Incident | undefined>;
  activeIncidents(): Promise<Incident[]>;

  getMonitoringActive(): Promise<boolean>;
  setMonitoringActive(active: boolean): Promise<void>;
}
