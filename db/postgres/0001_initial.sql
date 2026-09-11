CREATE TABLE users (
  id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin','user')),
  disabled integer NOT NULL DEFAULT 0 CHECK (disabled IN (0,1)), created_at text NOT NULL
);
CREATE TABLE settings (key text PRIMARY KEY, value text NOT NULL);
CREATE TABLE invitations (email text PRIMARY KEY, name text NOT NULL, role text NOT NULL);
CREATE TABLE banks (
  id text PRIMARY KEY, title text NOT NULL, description text NOT NULL,
  questions text NOT NULL, count integer NOT NULL, archived integer NOT NULL DEFAULT 0, created_at text NOT NULL
);
CREATE TABLE attempts (
  id text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), bank_id text NOT NULL,
  title text NOT NULL, status text NOT NULL CHECK (status IN ('active','submitted')),
  questions text NOT NULL, states text NOT NULL, current integer NOT NULL DEFAULT 0,
  revision integer NOT NULL DEFAULT 0, sync_token text, created_at text NOT NULL, submitted_at text
);
CREATE INDEX attempts_user_status ON attempts(user_id,status);
CREATE TABLE events (id text PRIMARY KEY, attempt_id text NOT NULL REFERENCES attempts(id), payload text NOT NULL);
CREATE INDEX events_attempt ON events(attempt_id);
CREATE TABLE credentials (user_id text PRIMARY KEY REFERENCES users(id), username text NOT NULL UNIQUE, password_hash text NOT NULL);
CREATE TABLE sessions (token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES users(id), expires_at bigint NOT NULL);
CREATE INDEX sessions_user ON sessions(user_id);
CREATE INDEX sessions_expiry ON sessions(expires_at);
CREATE TABLE login_attempts (key text PRIMARY KEY, attempts integer NOT NULL, expires_at bigint NOT NULL);

-- No browser/Data API access; Railway authenticates each request server-side.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE banks ENABLE ROW LEVEL SECURITY;
ALTER TABLE attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE login_attempts ENABLE ROW LEVEL SECURITY;
