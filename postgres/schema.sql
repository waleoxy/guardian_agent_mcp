-- Guardian's Postgres schema. Kept in exact structural sync with
-- prisma/schema.prisma (same tables, same columns, same types) —
-- this is what postgresStore.ts actually runs against via node-postgres,
-- since this sandbox can't reach binaries.prisma.sh to run Prisma's
-- own migration engine. If you're on a network that can reach it,
-- `npx prisma migrate dev` from schema.prisma is equivalent; if you'd
-- rather just run this file directly, it's authoritative and tested.

CREATE TYPE person_role AS ENUM ('owner', 'parent', 'child', 'caregiver', 'other');
CREATE TYPE member_status AS ENUM ('home', 'away', 'unknown');
CREATE TYPE action_tier AS ENUM ('inform', 'ask', 'escalate');
CREATE TYPE incident_status AS ENUM ('open', 'awaiting_response', 'resolved', 'escalated');

CREATE TABLE members (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  role         person_role NOT NULL,
  routine      TEXT,
  vulnerable   BOOLEAN NOT NULL DEFAULT FALSE,
  status       member_status,
  last_seen_at TIMESTAMPTZ
);

CREATE TABLE visitors (
  id                TEXT PRIMARY KEY,
  label             TEXT NOT NULL,
  day_of_week       INT NOT NULL,
  time_window_start TEXT NOT NULL,
  time_window_end   TEXT NOT NULL
);

CREATE TABLE policies (
  id          TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  event_type  TEXT,
  location    TEXT,
  tier        action_tier NOT NULL,
  notes       TEXT
);

CREATE TABLE events (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source    TEXT NOT NULL,
  type      TEXT NOT NULL,
  location  TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw       JSONB
);
CREATE INDEX events_timestamp_idx ON events (timestamp DESC);

CREATE TABLE incidents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type              TEXT NOT NULL,
  status            incident_status NOT NULL,
  subject_member_id TEXT,
  related_event_ids TEXT[] NOT NULL DEFAULT '{}',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  reasoning         TEXT,
  confidence         INT,
  tier              action_tier
);
CREATE INDEX incidents_status_idx ON incidents (status);

CREATE TABLE config (
  key   TEXT PRIMARY KEY,
  value BOOLEAN NOT NULL
);
