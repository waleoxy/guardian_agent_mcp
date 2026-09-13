import "dotenv/config";
import { Pool } from "pg";
import { seedMembers, seedVisitors, seedPolicies } from "../store/seedData";

/**
 * Run after applying postgres/schema.sql, before setting
 * STORE_BACKEND=postgres:
 *
 *   npx ts-node src/scripts/seedPostgres.ts
 *   (or: npm run build && node dist/scripts/seedPostgres.js)
 *
 * Populates members / visitors / policies with the same demo
 * household MemoryStore seeds itself with. Idempotent — safe to
 * re-run, uses ON CONFLICT upserts throughout.
 */

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  for (const m of seedMembers) {
    await pool.query(
      `INSERT INTO members (id, name, role, routine, vulnerable, status, last_seen_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, routine = EXCLUDED.routine,
         vulnerable = EXCLUDED.vulnerable, status = EXCLUDED.status,
         last_seen_at = EXCLUDED.last_seen_at`,
      [
        m.id,
        m.name,
        m.role,
        m.routine ?? null,
        m.vulnerable,
        m.status ?? null,
        m.lastSeenAt ?? null,
      ],
    );
  }

  for (const v of seedVisitors) {
    await pool.query(
      `INSERT INTO visitors (id, label, day_of_week, time_window_start, time_window_end)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET
         label = EXCLUDED.label, day_of_week = EXCLUDED.day_of_week,
         time_window_start = EXCLUDED.time_window_start,
         time_window_end = EXCLUDED.time_window_end`,
      [v.id, v.label, v.dayOfWeek, v.timeWindowStart, v.timeWindowEnd],
    );
  }

  for (const p of seedPolicies) {
    await pool.query(
      `INSERT INTO policies (id, description, event_type, location, tier, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         description = EXCLUDED.description, event_type = EXCLUDED.event_type,
         location = EXCLUDED.location, tier = EXCLUDED.tier, notes = EXCLUDED.notes`,
      [
        p.id,
        p.description,
        p.appliesTo.eventType ?? null,
        p.appliesTo.location ?? null,
        p.tier,
        p.notes ?? null,
      ],
    );
  }

  await pool.query(
    `INSERT INTO config (key, value) VALUES ('monitoringActive', false)
     ON CONFLICT (key) DO NOTHING`,
  );

  console.log(
    `Seeded ${seedMembers.length} members, ${seedVisitors.length} visitors, ${seedPolicies.length} policies, and monitoring config.`,
  );
  await pool.end();
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
