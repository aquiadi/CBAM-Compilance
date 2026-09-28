/**
 * Schema migrations, applied in order and recorded in `schema_migrations`.
 *
 * Plain SQL that runs unchanged on Postgres and on the embedded PGlite, so a
 * laptop, a Railway volume and a managed Neon database all hold the same shape.
 * Migrations are append-only: a shipped migration is never edited, a change is
 * a new entry.
 *
 * Workspace state (installation, period, datasets, activity records) is one
 * JSONB document per workspace with an optimistic-concurrency version. The
 * engine recomputes every figure from it on each read, so there is no derived
 * data to keep consistent; everything with its own lifecycle - users, files,
 * evidence, supplier requests, the audit log - has its own table.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "initial schema",
    sql: `
      CREATE TABLE users (
        id text PRIMARY KEY,
        email text NOT NULL UNIQUE,
        name text NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE sessions (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        user_agent text
      );
      CREATE INDEX sessions_user_idx ON sessions(user_id);

      CREATE TABLE organisations (
        id text PRIMARY KEY,
        name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE memberships (
        org_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer', 'verifier')),
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (org_id, user_id)
      );
      CREATE INDEX memberships_user_idx ON memberships(user_id);

      CREATE TABLE invitations (
        id text PRIMARY KEY,
        org_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        email text NOT NULL,
        role text NOT NULL CHECK (role IN ('owner', 'editor', 'viewer', 'verifier')),
        token_hash text NOT NULL UNIQUE,
        invited_by text REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz
      );

      CREATE TABLE workspaces (
        id text PRIMARY KEY,
        org_id text NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
        name text NOT NULL,
        state jsonb NOT NULL,
        version integer NOT NULL DEFAULT 1,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX workspaces_org_idx ON workspaces(org_id);

      CREATE TABLE files (
        id text PRIMARY KEY,
        workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        purpose text NOT NULL CHECK (purpose IN ('source', 'evidence', 'supplier')),
        file_name text NOT NULL,
        content_type text NOT NULL,
        size_bytes integer NOT NULL,
        sha256 text NOT NULL,
        content bytea NOT NULL,
        label text,
        category text,
        links jsonb NOT NULL DEFAULT '{}'::jsonb,
        uploaded_by text REFERENCES users(id) ON DELETE SET NULL,
        uploaded_by_label text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX files_workspace_idx ON files(workspace_id, purpose);

      CREATE TABLE audit_events (
        id bigserial PRIMARY KEY,
        org_id text NOT NULL,
        workspace_id text,
        actor_id text,
        actor_label text NOT NULL,
        action text NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_events_workspace_idx ON audit_events(workspace_id, created_at DESC);
      CREATE INDEX audit_events_org_idx ON audit_events(org_id, created_at DESC);

      CREATE TABLE supplier_requests (
        id text PRIMARY KEY,
        workspace_id text NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        supplier_name text NOT NULL,
        supplier_email text,
        cn_code text NOT NULL,
        message text,
        status text NOT NULL CHECK (status IN ('open', 'submitted', 'accepted', 'rejected', 'revoked')),
        submission jsonb,
        file_id text REFERENCES files(id) ON DELETE SET NULL,
        created_by text REFERENCES users(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        submitted_at timestamptz,
        decided_at timestamptz
      );
      CREATE INDEX supplier_requests_workspace_idx ON supplier_requests(workspace_id);

      CREATE TABLE rate_limits (
        key text PRIMARY KEY,
        count integer NOT NULL,
        reset_at timestamptz NOT NULL
      );
    `,
  },
  {
    version: 2,
    name: "password resets",
    sql: `
      CREATE TABLE password_resets (
        id text PRIMARY KEY,
        user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        issued_by text,
        created_at timestamptz NOT NULL DEFAULT now(),
        expires_at timestamptz NOT NULL,
        used_at timestamptz
      );
      CREATE INDEX password_resets_user_idx ON password_resets(user_id);
    `,
  },
];
