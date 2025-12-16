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

-- Users and auth backbone
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_subject text NOT NULL,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz,
  UNIQUE (provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities (user_id);

CREATE TABLE IF NOT EXISTS connected_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_account_id text NOT NULL,
  display_name text,
  scopes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, provider_account_id)
);
CREATE INDEX IF NOT EXISTS idx_connected_accounts_user_provider ON connected_accounts (user_id, provider);

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connected_account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
  access_token text NOT NULL,
  refresh_token text,
  expires_at timestamptz,
  token_type text,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Insert a default initial user for development (id generated)
INSERT INTO users (id, email, display_name, created_at, updated_at)
SELECT gen_random_uuid(), 'rishi.satsangi@gmail.com', 'dethbird', now(), now()
WHERE NOT EXISTS (
  SELECT 1 FROM users WHERE email = 'rishi.satsangi@gmail.com'
);