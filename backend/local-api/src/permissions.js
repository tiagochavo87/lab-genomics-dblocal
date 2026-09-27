// Tabelas de dados de pesquisa: leitura para usuários aprovados.
export const DATA_TABLES = ["disease_databases", "database_versions", "database_variables", "version_backups"];

// Campos que um usuário comum nunca pode alterar em seu próprio perfil.
export const PROFILE_ADMIN_ONLY_FIELDS = ["approved", "user_id", "id"];

const isAdmin = (user) => user?.app_role === "admin";
const isApproved = (user) => user?.approved === true || isAdmin(user);
const isEditor = (user) => isApproved(user) && (user.app_role === "admin" || user.app_role === "moderator");

export function canReadTable(user, table, filters = []) {
  if (!user) return false;
  if (DATA_TABLES.includes(table)) return isApproved(user);
  if (table === "profiles") return isAdmin(user) || hasOwnFilter(filters, user.id, ["user_id", "id"]);
  if (table === "user_roles") return isAdmin(user) || hasOwnFilter(filters, user.id, ["user_id"]);
  if (table === "activity_log") return isAdmin(user) || hasOwnFilter(filters, user.id, ["user_id"]);
  if (table === "backup_settings") return isAdmin(user);
  return false;
}

/**
 * @param {"insert"|"update"|"delete"} op
 */
export function canWriteTable(user, table, filters = [], values = {}, op = "insert") {
  if (!user) return false;

  if (table === "version_backups") {
    // Cópias de segurança são criadas/restauradas pelas rotas próprias do
    // servidor (/api/backups/...), que nunca passam os dados pelo navegador.
    return isAdmin(user) && op === "delete";
  }

  if (table === "database_versions") {
    if (!isEditor(user)) return false;
    // O conteúdo de uma versão existente só é alterado por admin: um
    // moderador vê os dados mascarados e poderia gravar a máscara por cima
    // do dado real.
    if (op === "update" && values && Object.prototype.hasOwnProperty.call(values, "data")) return isAdmin(user);
    return true;
  }

  if (table === "database_variables") {
    if (!isEditor(user)) return false;
    // A classificação LGPD de uma variável decide o que é mascarado: só quem
    // já vê os dados sem máscara (admin) pode alterá-la.
    if (values && Object.prototype.hasOwnProperty.call(values, "identifying") && !isAdmin(user)) return false;
    return true;
  }

  if (DATA_TABLES.includes(table)) return isEditor(user);

  if (table === "backup_settings" || table === "user_roles") return isAdmin(user);

  if (table === "profiles") {
    if (isAdmin(user)) return true;
    // Usuário comum: só atualiza a PRÓPRIA linha, decidido pelos filtros que
    // formam o WHERE. Não pode criar nem apagar perfis.
    return op === "update" && hasOwnFilter(filters, user.id, ["user_id", "id"]);
  }

  if (table === "activity_log") {
    // Log de auditoria é append-only para todos (inclusive admin): só
    // acrescenta registros, sempre em nome do próprio usuário.
    return op === "insert" && values?.user_id === user.id;
  }

  return false;
}

export function restrictProfileFields(user, payload) {
  if (isAdmin(user)) return payload;
  const clean = { ...payload };
  for (const field of PROFILE_ADMIN_ONLY_FIELDS) delete clean[field];
  return clean;
}

// Só considera filtros que viram cláusula do WHERE (op === "eq").
export function hasOwnFilter(filters, userId, fields) {
  if (!Array.isArray(filters)) return false;
  return filters.some((f) => f?.op === "eq" && fields.includes(f?.field) && String(f?.value) === String(userId));
}
