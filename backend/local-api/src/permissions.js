const PUBLIC_READ_TABLES = ["disease_databases", "database_versions", "database_variables", "version_backups"];

// Campos que um usuário comum nunca pode alterar em seu próprio perfil.
// Só admins podem promover, aprovar ou reatribuir um perfil a outro usuário.
export const PROFILE_ADMIN_ONLY_FIELDS = ["approved", "user_id", "id"];

export function canReadTable(user, table, filters = []) {
  if (!user) return false;
  if (PUBLIC_READ_TABLES.includes(table)) return user.approved === true || user.app_role === "admin";
  if (table === "profiles") return user.app_role === "admin" || hasOwnFilter(filters, user.id, ["user_id", "id"]);
  if (table === "user_roles") return user.app_role === "admin" || hasOwnFilter(filters, user.id, ["user_id"]);
  if (table === "activity_log") return user.app_role === "admin" || hasOwnFilter(filters, user.id, ["user_id"]);
  if (table === "backup_settings") return user.app_role === "admin";
  return false;
}

export function canWriteTable(user, table, filters = [], values = {}) {
  if (!user) return false;
  if (PUBLIC_READ_TABLES.includes(table)) {
    return (user.app_role === "admin" || user.app_role === "moderator") && user.approved === true;
  }
  if (table === "backup_settings" || table === "user_roles") return user.app_role === "admin";
  if (table === "profiles") {
    if (user.app_role === "admin") return true;
    // Usuário comum só pode escrever na PRÓPRIA linha (verificado pelos filtros
    // que efetivamente formam o WHERE da query, nunca pelos `values` enviados
    // pelo próprio cliente).
    return hasOwnFilter(filters, user.id, ["user_id", "id"]);
  }
  if (table === "activity_log") {
    if (user.app_role === "admin") return true;
    // Log de auditoria é append-only para não-admins: só INSERT (sem filtros)
    // e sempre em nome do próprio usuário. PATCH/DELETE (que usam filtros)
    // ficam bloqueados para não permitir adulterar registros existentes.
    return (!filters || filters.length === 0) && values.user_id === user.id;
  }
  return false;
}

// Remove campos que um usuário não-admin não pode setar diretamente
// (ex.: auto-aprovação, troca de dono do perfil).
export function restrictProfileFields(user, payload) {
  if (user.app_role === "admin") return payload;
  const clean = { ...payload };
  for (const field of PROFILE_ADMIN_ONLY_FIELDS) delete clean[field];
  return clean;
}

// Só considera filtros que de fato viram cláusula do WHERE (op === "eq").
// Antes, um filtro com op diferente passava nesta checagem mas era descartado
// pelo buildWhere, liberando leitura/escrita/remoção de linhas de terceiros.
function hasOwnFilter(filters, userId, fields) {
  if (!Array.isArray(filters)) return false;
  return filters.some((f) => f?.op === "eq" && fields.includes(f?.field) && String(f?.value) === String(userId));
}
