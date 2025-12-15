-- Raw SQL migration for journaling schema
-- Run this via psql when you want to seed a Postgres database without Prisma

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  external_id text,
  payload jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_events_source_occurred_at ON events (source, occurred_at);
CREATE UNIQUE INDEX IF NOT EXISTS ux_events_source_external_id ON events (source, external_id) WHERE external_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS cursors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL UNIQUE,
  cursor text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS days (
  date date PRIMARY KEY,
  mood text,
  note text,
  highlights text,
  privacy_level text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS day_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  day_date date NOT NULL REFERENCES days(date) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  UNIQUE (day_date, event_id)
);