import { Pool } from "pg";
import {
  HouseholdMember,
  ExpectedVisitor,
  HouseholdEvent,
  Policy,
  Incident,
  ActionTier,
  IncidentStatus,
} from "../types/domain";
import { IGuardianStore, NewEventInput, NewIncidentInput } from "./types";

/**
 * Postgres-backed store via node-postgres (pg), not Prisma Client.
 *
 * Why not Prisma here: this was built in a sandboxed environment that
 * can't reach binaries.prisma.sh to fetch Prisma's Rust engine, so
 * `prisma generate`/`migrate` couldn't be run or verified. `pg` is a
 * pure-JS driver with no binary download step, so this implementation
 * could actually be tested end to end against a real local Postgres
 * instance rather than shipped unverified.
 *
 * prisma/schema.prisma is kept in exact structural sync with
 * postgres/schema.sql (same tables/columns/types) as the intended
 * future path: on a network that can reach Prisma's CDN, generate a
 * Prisma Client from that schema and swap this file's query bodies
 * for `prisma.member.findMany()` etc. — the IGuardianStore interface
 * and every call site stay identical either way.
 */

function pool(): Pool {
  if (!globalPool) {
    globalPool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return globalPool;
}
let globalPool: Pool | undefined;

export class PostgresStore implements IGuardianStore {
  async listMembers(): Promise<HouseholdMember[]> {
    const { rows } = await pool().query(
      `SELECT id, name, role, routine, vulnerable, status, last_seen_at AS "lastSeenAt"
       FROM members`,
    );
    return rows.map(rowToMember);
  }

  async getMember(id: string): Promise<HouseholdMember | undefined> {
    const { rows } = await pool().query(
      `SELECT id, name, role, routine, vulnerable, status, last_seen_at AS "lastSeenAt"
       FROM members WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToMember(rows[0]) : undefined;
  }

  async listVisitors(): Promise<ExpectedVisitor[]> {
    const { rows } = await pool().query(
      `SELECT id, label, day_of_week AS "dayOfWeek",
              time_window_start AS "timeWindowStart",
              time_window_end AS "timeWindowEnd"
       FROM visitors`,
    );
    return rows;
  }

  async listPolicies(): Promise<Policy[]> {
    const { rows } = await pool().query(
      `SELECT id, description, event_type AS "eventType", location, tier, notes
       FROM policies`,
    );
    return rows.map(rowToPolicy);
  }

  async addPolicy(policy: Policy): Promise<Policy> {
    await pool().query(
      `INSERT INTO policies (id, description, event_type, location, tier, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description,
         event_type = EXCLUDED.event_type,
         location = EXCLUDED.location,
         tier = EXCLUDED.tier,
         notes = EXCLUDED.notes`,
      [
        policy.id,
        policy.description,
        policy.appliesTo.eventType ?? null,
        policy.appliesTo.location ?? null,
        policy.tier,
        policy.notes ?? null,
      ],
    );
    return policy;
  }

  async addEvent(input: NewEventInput): Promise<HouseholdEvent> {
    const { rows } = await pool().query(
      `INSERT INTO events (source, type, location, timestamp)
       VALUES ($1, $2, $3, COALESCE($4, now()))
       RETURNING id, source, type, location, timestamp`,
      [input.source, input.type, input.location, input.timestamp ?? null],
    );
    return rowToEvent(rows[0]);
  }

  async recentEvents(limit: number): Promise<HouseholdEvent[]> {
    const { rows } = await pool().query(
      `SELECT id, source, type, location, timestamp
       FROM events ORDER BY timestamp DESC LIMIT $1`,
      [limit],
    );
    return rows.map(rowToEvent);
  }

  async createIncident(input: NewIncidentInput): Promise<Incident> {
    const { rows } = await pool().query(
      `INSERT INTO incidents
         (type, status, subject_member_id, related_event_ids, reasoning, confidence, tier)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, type, status, subject_member_id AS "subjectMemberId",
                 related_event_ids AS "relatedEventIds", created_at AS "createdAt",
                 updated_at AS "updatedAt", reasoning, confidence, tier`,
      [
        input.type,
        input.status,
        input.subjectMemberId ?? null,
        input.relatedEventIds,
        input.reasoning ?? null,
        input.confidence ?? null,
        input.tier ?? null,
      ],
    );
    return rowToIncident(rows[0]);
  }

  async updateIncident(
    id: string,
    patch: Partial<Incident>,
  ): Promise<Incident | undefined> {
    const existing = await this.getIncident(id);
    if (!existing) return undefined;
    const merged = { ...existing, ...patch };

    const { rows } = await pool().query(
      `UPDATE incidents SET
         type = $2, status = $3, subject_member_id = $4, related_event_ids = $5,
         reasoning = $6, confidence = $7, tier = $8, updated_at = now()
       WHERE id = $1
       RETURNING id, type, status, subject_member_id AS "subjectMemberId",
                 related_event_ids AS "relatedEventIds", created_at AS "createdAt",
                 updated_at AS "updatedAt", reasoning, confidence, tier`,
      [
        id,
        merged.type,
        merged.status,
        merged.subjectMemberId ?? null,
        merged.relatedEventIds,
        merged.reasoning ?? null,
        merged.confidence ?? null,
        merged.tier ?? null,
      ],
    );
    return rowToIncident(rows[0]);
  }

  async getIncident(id: string): Promise<Incident | undefined> {
    const { rows } = await pool().query(
      `SELECT id, type, status, subject_member_id AS "subjectMemberId",
              related_event_ids AS "relatedEventIds", created_at AS "createdAt",
              updated_at AS "updatedAt", reasoning, confidence, tier
       FROM incidents WHERE id = $1`,
      [id],
    );
    return rows[0] ? rowToIncident(rows[0]) : undefined;
  }

  async activeIncidents(): Promise<Incident[]> {
    const { rows } = await pool().query(
      `SELECT id, type, status, subject_member_id AS "subjectMemberId",
              related_event_ids AS "relatedEventIds", created_at AS "createdAt",
              updated_at AS "updatedAt", reasoning, confidence, tier
       FROM incidents WHERE status IN ('open', 'awaiting_response')`,
    );
    return rows.map(rowToIncident);
  }

  async getMonitoringActive(): Promise<boolean> {
    const { rows } = await pool().query(
      `SELECT value FROM config WHERE key = 'monitoringActive'`,
    );
    return rows[0]?.value ?? false;
  }

  async setMonitoringActive(active: boolean): Promise<void> {
    await pool().query(
      `INSERT INTO config (key, value) VALUES ('monitoringActive', $1)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [active],
    );
  }
}

// --- row mappers: snake_case/flattened SQL rows -> domain shapes ---

function rowToMember(row: any): HouseholdMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    routine: row.routine ?? undefined,
    vulnerable: row.vulnerable,
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
    tier: row.tier as ActionTier,
    notes: row.notes ?? undefined,
  };
}

function rowToEvent(row: any): HouseholdEvent {
  return {
    id: row.id,
    source: row.source,
    type: row.type,
    location: row.location,
    timestamp: row.timestamp.toISOString(),
  };
}

function rowToIncident(row: any): Incident {
  return {
    id: row.id,
    type: row.type,
    status: row.status as IncidentStatus,
    subjectMemberId: row.subjectMemberId ?? undefined,
    relatedEventIds: row.relatedEventIds ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    reasoning: row.reasoning ?? undefined,
    confidence: row.confidence ?? undefined,
    tier: row.tier ?? undefined,
  };
}
