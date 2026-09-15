import { randomUUID } from "crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import {
  HouseholdMember,
  ExpectedVisitor,
  HouseholdEvent,
  Policy,
  Incident,
} from "../types/domain";
import { IGuardianStore, NewEventInput, NewIncidentInput } from "./types";

/**
 * DynamoDB-backed store. Table design: one table per entity, on-demand
 * capacity, simple id-keyed schema — deliberately un-clever so it's
 * fast to stand up during a hackathon. See infra/dynamodb-tables.sh
 * for table-creation commands.
 *
 * Not a single-table design on purpose: at this scale (one household)
 * the query patterns are simple enough that the operational
 * simplicity of separate tables beats single-table's efficiency.
 * Revisit if Guardian ever needs to serve many households.
 */

const REGION = process.env.AWS_REGION ?? "us-east-1";

const TABLES = {
  members: process.env.TABLE_MEMBERS ?? "guardian-members",
  visitors: process.env.TABLE_VISITORS ?? "guardian-visitors",
  policies: process.env.TABLE_POLICIES ?? "guardian-policies",
  events: process.env.TABLE_EVENTS ?? "guardian-events",
  incidents: process.env.TABLE_INCIDENTS ?? "guardian-incidents",
  config: process.env.TABLE_CONFIG ?? "guardian-config",
};

const CONFIG_KEY = "monitoringActive";

export class DynamoStore implements IGuardianStore {
  private client: DynamoDBDocumentClient;

  constructor() {
    const base = new DynamoDBClient({ region: REGION });
    this.client = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  async listMembers(): Promise<HouseholdMember[]> {
    const res = await this.client.send(
      new ScanCommand({ TableName: TABLES.members }),
    );
    return (res.Items ?? []) as HouseholdMember[];
  }

  async getMember(id: string): Promise<HouseholdMember | undefined> {
    const res = await this.client.send(
      new GetCommand({ TableName: TABLES.members, Key: { id } }),
    );
    return res.Item as HouseholdMember | undefined;
  }

  async updateMember(id: string, patch: Partial<HouseholdMember>): Promise<HouseholdMember | undefined> {
    const existing = await this.getMember(id);
    if (!existing) return undefined;
    const updated = { ...existing, ...patch };
    await this.client.send(
      new PutCommand({ TableName: TABLES.members, Item: updated }),
    );
    return updated;
  }

  async listVisitors(): Promise<ExpectedVisitor[]> {
    const res = await this.client.send(
      new ScanCommand({ TableName: TABLES.visitors }),
    );
    return (res.Items ?? []) as ExpectedVisitor[];
  }

  async listPolicies(): Promise<Policy[]> {
    const res = await this.client.send(
      new ScanCommand({ TableName: TABLES.policies }),
    );
    return (res.Items ?? []) as Policy[];
  }

  async addPolicy(policy: Policy): Promise<Policy> {
    await this.client.send(
      new PutCommand({ TableName: TABLES.policies, Item: policy }),
    );
    return policy;
  }

  async addEvent(input: NewEventInput): Promise<HouseholdEvent> {
    const event: HouseholdEvent = {
      ...input,
      id: randomUUID(),
      timestamp: input.timestamp ?? new Date().toISOString(),
    };
    await this.client.send(
      new PutCommand({ TableName: TABLES.events, Item: event }),
    );
    return event;
  }

  async recentEvents(limit: number): Promise<HouseholdEvent[]> {
    // Scan + sort is fine at hackathon scale (one household, low
    // event volume). At real scale, add a GSI keyed on a constant
    // partition + timestamp sort key and Query instead.
    const res = await this.client.send(
      new ScanCommand({ TableName: TABLES.events }),
    );
    const items = (res.Items ?? []) as HouseholdEvent[];
    return items
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, limit);
  }

  async createIncident(input: NewIncidentInput): Promise<Incident> {
    const now = new Date().toISOString();
    const incident: Incident = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      ...input,
    };
    await this.client.send(
      new PutCommand({ TableName: TABLES.incidents, Item: incident }),
    );
    return incident;
  }

  async updateIncident(
    id: string,
    patch: Partial<Incident>,
  ): Promise<Incident | undefined> {
    const existing = await this.getIncident(id);
    if (!existing) return undefined;
    const updated: Incident = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await this.client.send(
      new PutCommand({ TableName: TABLES.incidents, Item: updated }),
    );
    return updated;
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    const res = await this.client.send(
      new GetCommand({ TableName: TABLES.incidents, Key: { id } }),
    );
    return res.Item as Incident | undefined;
  }

  async activeIncidents(): Promise<Incident[]> {
    const res = await this.client.send(
      new ScanCommand({ TableName: TABLES.incidents }),
    );
    const items = (res.Items ?? []) as Incident[];
    return items.filter(
      (i) => i.status === "open" || i.status === "awaiting_response",
    );
  }

  async getMonitoringActive(): Promise<boolean> {
    const res = await this.client.send(
      new GetCommand({ TableName: TABLES.config, Key: { key: CONFIG_KEY } }),
    );
    return Boolean(res.Item?.value ?? false);
  }

  async setMonitoringActive(active: boolean): Promise<void> {
    await this.client.send(
      new UpdateCommand({
        TableName: TABLES.config,
        Key: { key: CONFIG_KEY },
        UpdateExpression: "SET #v = :v",
        ExpressionAttributeNames: { "#v": "value" },
        ExpressionAttributeValues: { ":v": active },
      }),
    );
  }
}
