-- ExamGuard on Supabase: run once in the Supabase SQL editor as the default `postgres` user.
--
-- Why a dedicated role and schema:
-- * Supabase's Data API (PostgREST) serves the `public` schema with the publishable/anon key.
--   ExamGuard tables hold password hashes, answers and identity photos, so they live in their
--   own `examguard` schema, which the Data API does not expose.
-- * The API connects as `examguard`, which owns only that schema, instead of the `postgres` admin.
--
-- Before running: replace the password below with a long random value (no quotes or spaces), e.g.
--   openssl rand -base64 32 | tr -d '/+='
-- Keep it; it becomes SPRING_DATASOURCE_PASSWORD on Render.

CREATE ROLE examguard WITH LOGIN PASSWORD 'replace-with-a-long-random-password';

-- Lets `postgres` create the schema on behalf of the new role (PostgreSQL 16 requires membership).
GRANT examguard TO postgres;

CREATE SCHEMA examguard AUTHORIZATION examguard;

-- The API only ever works inside its own schema; Flyway creates every table on first boot.
ALTER ROLE examguard SET search_path = examguard;

-- Nothing else may read the schema (the Data API roles in particular).
REVOKE ALL ON SCHEMA examguard FROM PUBLIC;
