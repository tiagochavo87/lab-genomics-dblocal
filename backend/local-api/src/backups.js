// Cópias de versão (tabela version_backups) e envio para destinos externos,
// feitos inteiramente no servidor: os dados nunca passam pelo navegador (que
// poderia estar vendo a versão mascarada) e as credenciais dos destinos não
// saem do banco.
import { query, withTransaction } from "./db.js";
import { openConfig } from "./secrets.js";

export async function backupVersion(client, versionId, reason, userId) {
  const { rows } = await client.query(`
    INSERT INTO version_backups (database_id, version_id, version_name, version_number, row_count, data, backup_reason, created_by)
    SELECT database_id, id, name, version_number, row_count, data, $2, $3
    FROM database_versions WHERE id = $1
    RETURNING id, database_id, version_id, version_name, version_number, row_count, backup_reason, created_at
  `, [versionId, reason, userId]);
  return rows[0] || null;
}

/** Faz cópia de todas as versões de um banco (uma por versão e motivo). */
export async function backupDatabase(databaseId, reason, userId) {
  return withTransaction(async (client) => {
    const { rows: versions } = await client.query(
      "SELECT id FROM database_versions WHERE database_id = $1", [databaseId]
    );
    const created = [];
    for (const v of versions) {
      const exists = await client.query(
        "SELECT 1 FROM version_backups WHERE version_id = $1 AND backup_reason = $2 LIMIT 1", [v.id, reason]
      );
      if (exists.rows.length) continue;
      const b = await backupVersion(client, v.id, reason, userId);
      if (b) created.push(b);
    }
    return { versions: versions.length, created };
  });
}

export async function restoreBackup(backupId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      "SELECT id, version_id, version_name, data, row_count FROM version_backups WHERE id = $1", [backupId]
    );
    const backup = rows[0];
    if (!backup) return null;
    const updated = await client.query(`
      UPDATE database_versions
      SET name = $2, data = $3, row_count = $4
      WHERE id = $1
      RETURNING id, name, database_id, row_count, version_number
    `, [backup.version_id, `${backup.version_name} (restaurado)`, JSON.stringify(backup.data), backup.row_count]);
    return { backup: { id: backup.id, version_name: backup.version_name }, version: updated.rows[0] || null };
  });
}

async function postJson(url, body, headers, timeoutMs = 60000) {
  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("URL precisa ser http(s)");
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "error",
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
}

/** Envia uma versão para os destinos de backup habilitados. */
export async function sendVersionToDestinations(versionId) {
  const { rows } = await query(
    "SELECT id, name, version_number, row_count, data, database_id FROM database_versions WHERE id = $1", [versionId]
  );
  const version = rows[0];
  if (!version) return null;

  const settings = await query("SELECT * FROM backup_settings WHERE enabled = true ORDER BY created_at");
  const payload = {
    version_name: version.name,
    version_number: version.version_number,
    row_count: version.row_count,
    data: version.data,
    timestamp: new Date().toISOString(),
  };

  const results = [];
  for (const setting of settings.rows) {
    const cfg = openConfig(setting.config);
    try {
      if (setting.setting_type === "external_server") {
        if (!cfg.url) throw new Error("URL não configurada");
        await postJson(cfg.url, payload, cfg.auth_token ? { Authorization: `Bearer ${cfg.auth_token}` } : {});
        results.push({ label: setting.label, success: true });
      } else if (setting.setting_type === "university_server") {
        if (!cfg.server_url) throw new Error("URL do servidor não configurada");
        const url = cfg.remote_path ? `${cfg.server_url}${cfg.remote_path}` : cfg.server_url;
        const headers = cfg.username && cfg.password
          ? { Authorization: `Basic ${Buffer.from(`${cfg.username}:${cfg.password}`).toString("base64")}` }
          : {};
        await postJson(url, payload, headers);
        results.push({ label: setting.label, success: true });
      }
      // cloud_storage / manual_download / google_drive: sem envio automático.
    } catch (err) {
      results.push({ label: setting.label, success: false, error: err.message });
    }
  }
  return results;
}
