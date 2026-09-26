// Tabelas expostas pela API genérica /api/table/:table e suas colunas
// permitidas. users e password_reset_tokens NÃO entram aqui de propósito:
// só são acessadas pelas rotas de autenticação.
export const TABLES = {
  profiles: ["id", "user_id", "full_name", "role", "laboratory", "avatar_url", "approved", "institution", "program", "advisor", "created_at", "updated_at"],
  user_roles: ["id", "user_id", "role"],
  disease_databases: ["id", "created_at", "created_by", "description", "disease", "name", "updated_at"],
  database_versions: ["id", "created_at", "created_by", "data", "database_id", "name", "row_count", "version_number"],
  database_variables: ["id", "category", "created_at", "database_id", "description", "name", "sort_order", "variable_type", "identifying"],
  version_backups: ["id", "backup_reason", "created_at", "created_by", "data", "database_id", "row_count", "version_id", "version_name", "version_number"],
  backup_settings: ["id", "config", "created_at", "created_by", "enabled", "label", "setting_type", "updated_at"],
  activity_log: ["id", "action", "created_at", "details", "entity_id", "entity_type", "user_id", "user_name", "source", "ip"],
};

export const JSON_COLUMNS = {
  database_versions: ["data"],
  version_backups: ["data"],
  backup_settings: ["config"],
  activity_log: ["details"],
};

// Colunas que o servidor preenche sozinho (o cliente não pode forjar).
export const SERVER_MANAGED = {
  disease_databases: ["created_by", "created_at", "updated_at"],
  database_versions: ["created_by", "created_at"],
  version_backups: ["created_by", "created_at"],
  backup_settings: ["created_by", "created_at", "updated_at"],
  activity_log: ["user_name", "source", "ip", "created_at"],
  database_variables: ["created_at"],
  profiles: ["created_at", "updated_at"],
};

// Migrações versionadas. Nunca edite uma migração já publicada: crie outra.
const MIGRATIONS = [
  {
    id: 1,
    name: "schema_inicial",
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email text UNIQUE NOT NULL,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        full_name text NOT NULL DEFAULT '',
        role text NOT NULL DEFAULT '',
        laboratory text NOT NULL DEFAULT 'LAPOGE',
        avatar_url text,
        approved boolean NOT NULL DEFAULT false,
        institution text NOT NULL DEFAULT '',
        program text NOT NULL DEFAULT '',
        advisor text NOT NULL DEFAULT '',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS user_roles (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role text NOT NULL CHECK (role IN ('admin','moderator','user')) DEFAULT 'user'
      );

      CREATE TABLE IF NOT EXISTS disease_databases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        description text,
        disease text NOT NULL,
        name text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS database_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        data jsonb,
        database_id uuid NOT NULL REFERENCES disease_databases(id) ON DELETE CASCADE,
        name text NOT NULL,
        row_count integer NOT NULL DEFAULT 0,
        version_number text NOT NULL DEFAULT '1'
      );

      CREATE TABLE IF NOT EXISTS database_variables (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        category text NOT NULL DEFAULT 'Geral',
        created_at timestamptz NOT NULL DEFAULT now(),
        database_id uuid NOT NULL REFERENCES disease_databases(id) ON DELETE CASCADE,
        description text,
        name text NOT NULL,
        sort_order integer NOT NULL DEFAULT 0,
        variable_type text NOT NULL DEFAULT 'text'
      );

      CREATE TABLE IF NOT EXISTS version_backups (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        backup_reason text NOT NULL DEFAULT 'manual',
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        data jsonb,
        database_id uuid NOT NULL REFERENCES disease_databases(id) ON DELETE CASCADE,
        row_count integer NOT NULL DEFAULT 0,
        version_id uuid NOT NULL REFERENCES database_versions(id) ON DELETE CASCADE,
        version_name text NOT NULL,
        version_number text NOT NULL
      );

      CREATE TABLE IF NOT EXISTS backup_settings (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        config jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        created_by uuid REFERENCES users(id) ON DELETE SET NULL,
        enabled boolean NOT NULL DEFAULT true,
        label text NOT NULL DEFAULT '',
        setting_type text NOT NULL,
        updated_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS activity_log (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        action text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        details jsonb,
        entity_id text,
        entity_type text NOT NULL DEFAULT '',
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name text NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token text UNIQUE NOT NULL,
        expires_at timestamptz NOT NULL,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `,
  },
  {
    id: 2,
    name: "v2_seguranca",
    sql: `
      -- Revogação de sessões: todo JWT carrega a versão; trocar a senha
      -- incrementa e invalida os tokens antigos.
      ALTER TABLE users ADD COLUMN IF NOT EXISTS token_version integer NOT NULL DEFAULT 0;

      -- Origem do registro de auditoria: 'server' (gravado pela API, confiável)
      -- ou 'client' (enviado pelo navegador).
      ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'client';
      ALTER TABLE activity_log ADD COLUMN IF NOT EXISTS ip text;
      CREATE INDEX IF NOT EXISTS activity_log_created_at_idx ON activity_log (created_at DESC);
      CREATE INDEX IF NOT EXISTS activity_log_user_idx ON activity_log (user_id);

      -- Marcação explícita de variável identificável (LGPD):
      -- NULL = detecção automática pelo nome; true/false = definido pelo admin.
      ALTER TABLE database_variables ADD COLUMN IF NOT EXISTS identifying boolean;

      CREATE INDEX IF NOT EXISTS database_versions_db_idx ON database_versions (database_id);
      CREATE INDEX IF NOT EXISTS version_backups_version_idx ON version_backups (version_id);

      -- Tokens de reset passam a ser guardados como hash SHA-256. Os tokens
      -- antigos (texto puro) são invalidados.
      DELETE FROM password_reset_tokens WHERE used_at IS NULL;
    `,
  },
];

export async function runMigrations(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id integer PRIMARY KEY,
      name text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query("SELECT id FROM schema_migrations");
  const applied = new Set(rows.map((r) => r.id));

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue;
    await client.query("BEGIN");
    try {
      await client.query(migration.sql);
      await client.query("INSERT INTO schema_migrations (id, name) VALUES ($1, $2)", [migration.id, migration.name]);
      await client.query("COMMIT");
      console.log(`[db] migração ${migration.id} (${migration.name}) aplicada`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Falha na migração ${migration.id} (${migration.name}): ${err.message}`);
    }
  }

  // E-mail único sem diferenciar maiúsculas/minúsculas. Fica fora da
  // transação: se já houver duplicados antigos, avisa em vez de impedir o boot.
  try {
    await client.query("CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email))");
  } catch (err) {
    console.warn(
      "[db] AVISO: há e-mails duplicados (diferindo só em maiúsculas/minúsculas) na tabela users. " +
      "Unifique as contas e reinicie para criar o índice único. Detalhe: " + err.message
    );
  }
}
