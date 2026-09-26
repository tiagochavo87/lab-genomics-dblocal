// Registro de auditoria gravado pelo próprio servidor (source = 'server').
// Diferente dos registros enviados pelo navegador, estes não podem ser
// omitidos nem forjados pelo usuário.
import { query } from "./db.js";

export function clientIp(req) {
  return req?.ip || req?.socket?.remoteAddress || null;
}

export async function audit(req, { userId, userName, action, entityType = "", entityId = null, details = {} }) {
  const uid = userId ?? req?.authUser?.id;
  if (!uid) return;
  try {
    await query(`
      INSERT INTO activity_log (user_id, user_name, action, entity_type, entity_id, details, source, ip)
      VALUES ($1, $2, $3, $4, $5, $6, 'server', $7)
    `, [
      uid,
      userName ?? req?.authUser?.full_name ?? req?.authUser?.email ?? "",
      action,
      entityType,
      entityId == null ? null : String(entityId),
      JSON.stringify(details ?? {}),
      clientIp(req),
    ]);
  } catch (err) {
    // Auditoria nunca deve derrubar a operação principal, mas a falha fica no log.
    console.error("[audit] falha ao registrar:", action, err.message);
  }
}

// Evita inundar o log com a mesma visualização a cada recarga de página:
// uma visualização de dado sensível por usuário/entidade a cada 10 minutos.
const recentViews = new Map();
const VIEW_WINDOW_MS = 10 * 60 * 1000;

export function shouldLogView(userId, key) {
  const now = Date.now();
  const k = `${userId}:${key}`;
  const last = recentViews.get(k);
  if (last && now - last < VIEW_WINDOW_MS) return false;
  recentViews.set(k, now);
  if (recentViews.size > 5000) {
    for (const [key2, t] of recentViews) if (now - t > VIEW_WINDOW_MS) recentViews.delete(key2);
  }
  return true;
}
