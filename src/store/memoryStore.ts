import { randomUUID } from "crypto";
import {
  HouseholdMember,
  ExpectedVisitor,
  HouseholdEvent,
  Policy,
  Incident,
} from "../types/domain";
import { IGuardianStore, NewEventInput, NewIncidentInput } from "./types";
import { seedMembers, seedVisitors, seedPolicies } from "./seedData";

/**
 * In-memory store for local dev and demos. Every method is async to
 * match IGuardianStore even though the work is synchronous — that
 * keeps callers backend-agnostic and means switching to
 * DynamoStore never requires touching a call site.
 */
export class MemoryStore implements IGuardianStore {
  private members = new Map<string, HouseholdMember>();
  private visitors = new Map<string, ExpectedVisitor>();
  private events: HouseholdEvent[] = [];
  private policies = new Map<string, Policy>();
  private incidents = new Map<string, Incident>();
  private monitoringActive = false;

  constructor() {
    this.seed();
  }

  private seed() {
    seedMembers.forEach((m) => this.members.set(m.id, m));
    seedVisitors.forEach((v) => this.visitors.set(v.id, v));
    seedPolicies.forEach((p) => this.policies.set(p.id, p));
  }

  async listMembers(): Promise<HouseholdMember[]> {
    return [...this.members.values()];
  }

  async getMember(id: string): Promise<HouseholdMember | undefined> {
    return this.members.get(id);
  }

  async listVisitors(): Promise<ExpectedVisitor[]> {
    return [...this.visitors.values()];
  }

  async listPolicies(): Promise<Policy[]> {
    return [...this.policies.values()];
  }

  async addPolicy(policy: Policy): Promise<Policy> {
    this.policies.set(policy.id, policy);
    return policy;
  }

  async addEvent(input: NewEventInput): Promise<HouseholdEvent> {
    const event: HouseholdEvent = {
      ...input,
      id: randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    this.events.unshift(event);
    return event;
  }

  async recentEvents(limit: number): Promise<HouseholdEvent[]> {
    return this.events.slice(0, limit);
  }

  async createIncident(input: NewIncidentInput): Promise<Incident> {
    const now = new Date().toISOString();
    const incident: Incident = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async updateIncident(
    id: string,
    patch: Partial<Incident>,
  ): Promise<Incident | undefined> {
    const existing = this.incidents.get(id);
    if (!existing) return undefined;
    const updated: Incident = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.incidents.set(id, updated);
    return updated;
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    return this.incidents.get(id);
  }

  async activeIncidents(): Promise<Incident[]> {
    return [...this.incidents.values()].filter(
      (i) => i.status === "open" || i.status === "awaiting_response",
    );
  }

  async getMonitoringActive(): Promise<boolean> {
    return this.monitoringActive;
  }

  async setMonitoringActive(active: boolean): Promise<void> {
    this.monitoringActive = active;
  }
}
