import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  HouseholdMember,
  ExpectedVisitor,
  HouseholdEvent,
  Policy,
  Incident,
} from "../types/domain";
import { IGuardianStore, NewEventInput, NewIncidentInput } from "./types";

/**
 * Prisma 7 implementation of IGuardianStore.
 *
 * NOT VERIFIED IN THIS SANDBOX. Written correctly against Prisma 7's
 * documented driver-adapter API (https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction),
 * but `prisma generate` needs binaries.prisma.sh — even with
 * `engineType = "client"` (the Rust-free query engine option) — to
 * fetch its schema-engine binary, and that domain is unconditionally
 * blocked in this build environment (403, confirmed after trying the
 * default engine, PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1, and the
 * Rust-free engineType — all three hit the same block). So the
 * `../generated/prisma` import below does not resolve here, this file
 * is excluded from tsconfig's compilation, and postgresStore.ts (pg,
 * fully verified) remains the default STORE_BACKEND=postgres
 * implementation.
 *
 * See README's "Switching to Prisma Client" section for the exact
 * activation steps once you've run `prisma generate` somewhere that
 * can reach Prisma's CDN.
 */

let prismaClient: PrismaClient | undefined;

function client(): PrismaClient {
  if (!prismaClient) {
    const adapter = new PrismaPg({
      connectionString: process.env.DATABASE_URL!,
    });
    prismaClient = new PrismaClient({ adapter });
  }
  return prismaClient;
}

export class PrismaStore implements IGuardianStore {
  async listMembers(): Promise<HouseholdMember[]> {
    const rows = await client().member.findMany();
    return rows.map(rowToMember);
  }

  async getMember(id: string): Promise<HouseholdMember | undefined> {
    const row = await client().member.findUnique({ where: { id } });
    return row ? rowToMember(row) : undefined;
  }

  async listVisitors(): Promise<ExpectedVisitor[]> {
    return client().visitor.findMany();
  }

  async listPolicies(): Promise<Policy[]> {
    const rows = await client().policy.findMany();
    return rows.map(rowToPolicy);
  }

  async addPolicy(policy: Policy): Promise<Policy> {
    await client().policy.upsert({
      where: { id: policy.id },
      create: {
        id: policy.id,
        description: policy.description,
        eventType: policy.appliesTo.eventType,
        location: policy.appliesTo.location,
        tier: policy.tier,
        notes: policy.notes,
      },
      update: {
        description: policy.description,
        eventType: policy.appliesTo.eventType,
        location: policy.appliesTo.location,
        tier: policy.tier,
        notes: policy.notes,
      },
    });
    return policy;
  }

  async addEvent(input: NewEventInput): Promise<HouseholdEvent> {
    const row = await client().event.create({
      data: {
        source: input.source,
        type: input.type,
        location: input.location,
        // Omitting `timestamp` entirely (rather than passing
        // `undefined`) lets Prisma's schema default (`now()`) apply —
        // this is the same class of bug fixed in postgresStore.ts and
        // memoryStore.ts: an explicit `timestamp: undefined` field is
        // different from an absent one.
        ...(input.timestamp ? { timestamp: new Date(input.timestamp) } : {}),
      },
    });
    return rowToEvent(row);
  }

  async recentEvents(limit: number): Promise<HouseholdEvent[]> {
    const rows = await client().event.findMany({
      orderBy: { timestamp: "desc" },
      take: limit,
    });
    return rows.map(rowToEvent);
  }

  async createIncident(input: NewIncidentInput): Promise<Incident> {
    const row = await client().incident.create({
      data: {
        type: input.type,
        status: input.status,
        subjectMemberId: input.subjectMemberId,
        relatedEventIds: input.relatedEventIds,
        reasoning: input.reasoning,
        confidence: input.confidence,
        tier: input.tier,
      },
    });
    return rowToIncident(row);
  }

  async updateIncident(
    id: string,
    patch: Partial<Incident>,
  ): Promise<Incident | undefined> {
    const existing = await client().incident.findUnique({ where: { id } });
    if (!existing) return undefined;
    const row = await client().incident.update({
      where: { id },
      data: {
        type: patch.type ?? undefined,
        status: patch.status ?? undefined,
        subjectMemberId: patch.subjectMemberId ?? undefined,
        relatedEventIds: patch.relatedEventIds ?? undefined,
        reasoning: patch.reasoning ?? undefined,
        confidence: patch.confidence ?? undefined,
        tier: patch.tier ?? undefined,
      },
    });
    return rowToIncident(row);
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    const row = await client().incident.findUnique({ where: { id } });
    return row ? rowToIncident(row) : undefined;
  }

  async activeIncidents(): Promise<Incident[]> {
    const rows = await client().incident.findMany({
      where: { status: { in: ["open", "awaiting_response"] } },
    });
    return rows.map(rowToIncident);
  }

  async getMonitoringActive(): Promise<boolean> {
    const row = await client().config.findUnique({
      where: { key: "monitoringActive" },
    });
    return row?.value ?? false;
  }

  async setMonitoringActive(active: boolean): Promise<void> {
    await client().config.upsert({
      where: { key: "monitoringActive" },
      create: { key: "monitoringActive", value: active },
      update: { value: active },
    });
  }
}

// --- row mappers: Prisma's generated shapes -> domain shapes ---
// (mostly 1:1 since the schema already uses camelCase field names —
// the one real reshape is Policy's flat eventType/location columns
// back into the nested `appliesTo` object.)

function rowToMember(row: any): HouseholdMember {
  return {
    ...row,
    routine: row.routine ?? undefined,
    status: row.status ?? undefined,
    lastSeenAt: row.lastSeenAt ? row.lastSeenAt.toISOString() : undefined,
  };
}

function rowToPolicy(row: any): Policy {
  return {
    id: row.id,
    description: row.description,
    appliesTo: {
      eventType: row.eventType ?? undefined,
      location: row.location ?? undefined,
    },
    tier: row.tier,
    notes: row.notes ?? undefined,
  };
}

function rowToEvent(row: any): HouseholdEvent {
  return { ...row, timestamp: row.timestamp.toISOString() };
}

function rowToIncident(row: any): Incident {
  return {
    ...row,
    subjectMemberId: row.subjectMemberId ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reasoning: row.reasoning ?? undefined,
    confidence: row.confidence ?? undefined,
    tier: row.tier ?? undefined,
  };
}
