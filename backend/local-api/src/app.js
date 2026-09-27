import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import crypto from "crypto";
import { config } from "./config.js";
import { query, withTransaction } from "./db.js";
import { TABLES, JSON_COLUMNS, SERVER_MANAGED } from "./schema.js";
import {
  buildSession, checkPasswordPolicy, comparePassword, getAuthUser, hashPassword, hashResetToken,
  isValidEmail, makeResetToken, normalizeEmail, revokeSessions,
} from "./auth.js";
import { canReadTable, canWriteTable, restrictProfileFields, DATA_TABLES } from "./permissions.js";
import { sendPasswordResetEmail } from "./mailer.js";
import { audit, clientIp, shouldLogView } from "./audit.js";
import { canSeeUnmasked, maskDataArray } from "./masking.js";
import { redactConfig, sealConfig } from "./secrets.js";
import { backupDatabase, backupVersion, restoreBackup, sendVersionToDestinations } from "./backups.js";

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Express 4 não captura exceções de handlers async: sem isto, um throw fora
// de try/catch vira unhandled rejection e derruba o processo inteiro.
function wrap(handler) {
  return (req, res, next) => {
    try {
      const out = handler(req, res, next);
      if (out && typeof out.catch === "function") out.catch(next);
    } catch (err) {
      next(err);
    }
  };
}

function parseTrustProxy(value) {
  if (!value) return false;
  if (/^\d+$/.test(value)) return Number(value);
  if (value === "true") return true;
  return value;
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", parseTrustProxy(config.trustProxy));

  // --- Cabeçalhos de segurança -------------------------------------------
  const csp = helmet.contentSecurityPolicy.getDefaultDirectives();
  csp["style-src"] = ["'self'", "'unsafe-inline'"];
  csp["font-src"] = ["'self'", "data:"];
  csp["img-src"] = ["'self'", "data:", "blob:"];
  csp["connect-src"] = ["'self'"];
  // upgrade-insecure-requests em um site servido por HTTP simples faz o
  // navegador pedir os assets em https:// e a página fica em branco.
  csp["upgrade-insecure-requests"] = config.https ? [] : null;
  app.use(helmet({
    contentSecurityPolicy: { directives: csp },
    strictTransportSecurity: config.https ? { maxAge: 31536000 } : false,
    // COOP/Origin-Agent-Cluster só têm efeito em origens seguras; em HTTP
    // geram apenas avisos no console.
    crossOriginOpenerPolicy: config.https,
    originAgentCluster: config.https,
  }));

  // --- CORS ------------------------------------------------------------------
  // A própria origem (frontend servido por este processo) é sempre aceita,
  // qualquer que seja o IP/hostname usado. Origens externas: só o allowlist.
  app.use(cors((req, callback) => {
    const origin = req.header("Origin");
    const self = `${req.protocol}://${req.get("host")}`;
    const allowed = !origin || origin === self || config.corsOrigins.includes(origin);
    callback(null, { origin: allowed, credentials: false });
  }));

  app.use(express.json({ limit: config.bodyLimit }));
  if (!config.isTest) {
    // Não usa :url completo para não gravar tokens de reset ou filtros no log.
    morgan.token("path", (req) => req.path);
    app.use(morgan(config.logFormat.replace(":url", ":path")));
  }

  // Limite geral por sessão (quando há token) ou por IP. Usuários do mesmo
  // laboratório costumam sair pelo mesmo IP (NAT), então contar só por IP
  // bloquearia o grupo inteiro.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_API || 3000),
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const auth = req.headers.authorization;
      if (auth && auth.startsWith("Bearer ")) return "t:" + crypto.createHash("sha256").update(auth).digest("hex").slice(0, 32);
      return "ip:" + ipKeyGenerator(req.ip || "");
    },
    message: { error: "Muitas requisições. Aguarde alguns minutos." },
  });
  // Rotas de autenticação: conta só as tentativas que FALHAM (força bruta),
  // para não travar o laboratório inteiro quando todos entram de manhã.
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_AUTH || 30),
    skipSuccessfulRequests: true,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
  });
  // Cadastro e pedido de recuperação de senha: conta TODAS as requisições
  // (respondem sempre 200, então "só falhas" não limitaria spam de e-mails).
  const strictLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: Number(process.env.RATE_LIMIT_STRICT || 20),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Muitas solicitações. Aguarde e tente novamente mais tarde." },
  });
  app.use(["/api", "/auth"], apiLimiter);

  app.get("/health", wrap(async (_req, res) => {
    let db = "ok";
    try { await query("SELECT 1"); } catch { db = "erro"; }
    res.status(db === "ok" ? 200 : 503).json({ ok: db === "ok", service: "dblapoge-local-api", version: "2.0.0", db });
  }));

  app.use(["/api", "/auth"], wrap(async (req, _res, next) => {
    req.authUser = await getAuthUser(req);
    next();
  }));

  const requireAuth = (req, res, next) => {
    if (!req.authUser) return res.status(401).json({ error: "Não autenticado" });
    next();
  };
  const requireEditor = (req, res, next) => {
    const u = req.authUser;
    const ok = u && (u.app_role === "admin" || (u.app_role === "moderator" && u.approved === true));
    if (!ok) return res.status(403).json({ error: "Sem permissão" });
    next();
  };
  const requireAdmin = (req, res, next) => {
    if (req.authUser?.app_role !== "admin") return res.status(403).json({ error: "Sem permissão" });
    next();
  };

  // --- Autenticação ------------------------------------------------------------

  app.post("/auth/register", strictLimiter, wrap(async (req, res) => {
    const { password, metadata } = req.body || {};
    const email = normalizeEmail(req.body?.email);
    if (!isValidEmail(email)) throw new HttpError(400, "E-mail inválido");
    const policyError = checkPasswordPolicy(password, email);
    if (policyError) throw new HttpError(400, policyError);

    const text = (v, max = 200) => String(v ?? "").slice(0, max);
    const passwordHash = await hashPassword(password);

    const user = await withTransaction(async (client) => {
      const existing = await client.query("SELECT id FROM users WHERE lower(email) = $1", [email]);
      if (existing.rows.length) throw new HttpError(409, "E-mail já cadastrado");
      const inserted = await client.query(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email", [email, passwordHash]
      );
      const u = inserted.rows[0];
      await client.query(`
        INSERT INTO profiles (user_id, full_name, approved, laboratory, role, institution, program, advisor)
        VALUES ($1, $2, false, $3, $4, $5, $6, $7)
      `, [u.id, text(metadata?.full_name), text(metadata?.laboratory) || "LAPOGE", text(metadata?.role),
        text(metadata?.institution), text(metadata?.program), text(metadata?.advisor)]);
      await client.query("INSERT INTO user_roles (user_id, role) VALUES ($1, 'user')", [u.id]);
      return u;
    });

    await audit(req, { userId: user.id, userName: text(metadata?.full_name) || email, action: "user_registered", entityType: "user", entityId: user.id });
    res.json({ data: { user: { id: user.id, email: user.email, user_metadata: { full_name: text(metadata?.full_name) } } } });
  }));

  app.post("/auth/login", authLimiter, wrap(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || !password) throw new HttpError(400, "Credenciais inválidas");
    const { rows } = await query("SELECT id, email, password_hash FROM users WHERE lower(email) = $1", [email]);
    const user = rows[0];
    const ok = await comparePassword(password, user?.password_hash);
    if (!user || !ok) {
      if (user) await audit(req, { userId: user.id, userName: user.email, action: "login_failed", entityType: "user", entityId: user.id });
      throw new HttpError(401, "Credenciais inválidas");
    }
    const session = await buildSession(user.id);
    await audit(req, { userId: user.id, userName: session.user.user_metadata.full_name || user.email, action: "login", entityType: "user", entityId: user.id });
    res.json({ data: session });
  }));

  app.get("/auth/session", requireAuth, wrap(async (req, res) => {
    // Renova o token (sessão deslizante) enquanto o usuário usa o sistema.
    res.json({ data: await buildSession(req.authUser.id) });
  }));

  // Troca de senha logado: exige a senha atual e derruba as outras sessões.
  app.patch("/auth/user", authLimiter, requireAuth, wrap(async (req, res) => {
    const { password, current_password: currentPassword } = req.body || {};
    const { rows } = await query("SELECT email, password_hash FROM users WHERE id = $1", [req.authUser.id]);
    if (!rows.length || !(await comparePassword(currentPassword, rows[0].password_hash))) {
      throw new HttpError(400, "Senha atual incorreta");
    }
    const policyError = checkPasswordPolicy(password, rows[0].email);
    if (policyError) throw new HttpError(400, policyError);
    const passwordHash = await hashPassword(password);
    await query("UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [passwordHash, req.authUser.id]);
    await audit(req, { action: "password_changed", entityType: "user", entityId: req.authUser.id });
    // Devolve um token novo para esta sessão continuar ativa.
    res.json({ data: await buildSession(req.authUser.id) });
  }));

  app.post("/auth/logout-all", requireAuth, wrap(async (req, res) => {
    await revokeSessions(req.authUser.id);
    await audit(req, { action: "logout_all_sessions", entityType: "user", entityId: req.authUser.id });
    res.json({ data: { ok: true } });
  }));

  app.post("/auth/reset-password/request", strictLimiter, wrap(async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    if (!email) throw new HttpError(400, "E-mail é obrigatório");
    const { rows } = await query("SELECT id, email FROM users WHERE lower(email) = $1", [email]);

    // Resposta sempre genérica: não revela se o e-mail existe e nunca devolve
    // o token (quem pede não é necessariamente o dono da conta).
    if (rows.length) {
      const token = makeResetToken();
      await withTransaction(async (client) => {
        // Um pedido novo invalida os anteriores ainda não usados.
        await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL", [rows[0].id]);
        await client.query(`
          INSERT INTO password_reset_tokens (user_id, token, expires_at)
          VALUES ($1, $2, now() + interval '1 hour')
        `, [rows[0].id, hashResetToken(token)]);
      });
      const link = `${config.publicAppUrl}?token=${token}`;
      await sendPasswordResetEmail(rows[0].email, link).catch((err) => {
        console.error("[reset-password] falha ao enviar e-mail:", err.message);
      });
      await audit(req, { userId: rows[0].id, userName: rows[0].email, action: "password_reset_requested", entityType: "user", entityId: rows[0].id });
    }
    res.json({ data: { ok: true } });
  }));

  app.post("/auth/reset-password/confirm", authLimiter, wrap(async (req, res) => {
    const { token, password } = req.body || {};
    if (!token || !password) throw new HttpError(400, "Dados inválidos");
    const tokenHash = hashResetToken(token);
    const result = await withTransaction(async (client) => {
      const { rows } = await client.query(`
        SELECT t.user_id, u.email FROM password_reset_tokens t
        JOIN users u ON u.id = t.user_id
        WHERE t.token = $1 AND t.used_at IS NULL AND t.expires_at > now()
        FOR UPDATE OF t
      `, [tokenHash]);
      if (!rows.length) throw new HttpError(400, "Link inválido ou expirado. Peça um novo.");
      const policyError = checkPasswordPolicy(password, rows[0].email);
      if (policyError) throw new HttpError(400, policyError);
      const passwordHash = await hashPassword(password);
      await client.query(
        "UPDATE users SET password_hash = $1, token_version = token_version + 1 WHERE id = $2", [passwordHash, rows[0].user_id]
      );
      await client.query("UPDATE password_reset_tokens SET used_at = now() WHERE token = $1", [tokenHash]);
      return rows[0];
    });
    await audit(req, { userId: result.user_id, userName: result.email, action: "password_reset_completed", entityType: "user", entityId: result.user_id });
    res.json({ data: { ok: true } });
  }));

  // --- API genérica de tabelas ---------------------------------------------------

  app.get("/api/table/:table", requireAuth, wrap(async (req, res) => {
    const table = req.params.table;
    if (!TABLES[table]) throw new HttpError(404, "Tabela não suportada");
    const filters = parseFilters(req.query.filters);
    if (!canReadTable(req.authUser, table, filters)) throw new HttpError(403, "Sem permissão");

    const requested = String(req.query.select || "*");
    let columns = sanitizeColumns(table, requested);
    // A máscara LGPD precisa do database_id (classificação por banco): inclui
    // a coluna na consulta mesmo que o cliente não a tenha pedido.
    const needsDbId = (table === "database_versions" || table === "version_backups")
      && columns !== "*" && columns.includes('"data"') && !columns.includes('"database_id"');
    if (needsDbId) columns += ', "database_id"';
    let order = null;
    try { order = req.query.order ? JSON.parse(String(req.query.order)) : null; } catch { order = null; }
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.floor(limitRaw), 100000) : null;
    const single = String(req.query.single || "false") === "true";

    const params = [];
    let sql = `SELECT ${columns} FROM ${qIdent(table)}`;
    const where = buildWhere(table, filters, params);
    if (where) sql += ` WHERE ${where}`;
    if (order?.column && TABLES[table].includes(order.column)) sql += ` ORDER BY ${qIdent(order.column)} ${order.ascending === false ? "DESC" : "ASC"}`;
    if (limit) sql += ` LIMIT ${limit}`;

    const result = await query(sql, params);
    const presented = await presentRows(req, table, result.rows);
    await auditSensitiveRead(req, table, presented);
    const rows = needsDbId ? projectSelection(table, presented, requested) : presented;
    res.json({ data: single ? (rows[0] || null) : rows });
  }));

  app.post("/api/table/:table", requireAuth, wrap(async (req, res) => {
    const table = req.params.table;
    if (!TABLES[table]) throw new HttpError(404, "Tabela não suportada");
    const values = req.body?.values;
    const rowsToInsert = Array.isArray(values) ? values : [values];
    if (!rowsToInsert.length || rowsToInsert.some((r) => !r || typeof r !== "object" || Array.isArray(r))) {
      throw new HttpError(400, "Nenhum dado válido informado");
    }
    // Cada linha do lote passa pela checagem de permissão individualmente.
    for (const row of rowsToInsert) {
      if (!canWriteTable(req.authUser, table, [], row, "insert")) throw new HttpError(403, "Sem permissão");
    }

    const inserted = await withTransaction(async (client) => {
      const out = [];
      for (const row of rowsToInsert) {
        const clean = sanitizePayload(table, prepareInsert(req, table, row));
        if (table === "backup_settings" && clean.config !== undefined) clean.config = JSON.stringify(sealConfig(JSON.parse(clean.config)));
        const keys = Object.keys(clean);
        if (!keys.length) throw new HttpError(400, "Nenhum campo válido");
        const placeholders = keys.map((_, idx) => `$${idx + 1}`).join(", ");
        const sql = `INSERT INTO ${qIdent(table)} (${keys.map(qIdent).join(", ")}) VALUES (${placeholders}) RETURNING *`;
        const result = await client.query(sql, keys.map((k) => clean[k]));
        out.push(result.rows[0]);
      }
      return out;
    });

    await auditWrite(req, table, "insert", inserted);
    const rows = await presentRows(req, table, inserted);
    const data = req.body?.single ? rows[0] : rows;
    res.json({ data: projectSelection(table, data, req.body?.select || "*") });
  }));

  app.patch("/api/table/:table", requireAuth, wrap(async (req, res) => {
    const table = req.params.table;
    if (!TABLES[table]) throw new HttpError(404, "Tabela não suportada");
    const filters = parseFilters(req.body?.filters);
    const rawValues = req.body?.values && typeof req.body.values === "object" ? req.body.values : {};
    if (!canWriteTable(req.authUser, table, filters, rawValues, "update")) throw new HttpError(403, "Sem permissão");

    let payload = table === "profiles" ? restrictProfileFields(req.authUser, rawValues) : { ...rawValues };
    for (const field of SERVER_MANAGED[table] || []) delete payload[field];
    delete payload.id;
    if (table === "database_versions" && Array.isArray(payload.data)) payload.row_count = payload.data.length;
    const clean = sanitizePayload(table, payload);
    if (!Object.keys(clean).length) throw new HttpError(400, "Nenhum campo válido para atualizar");

    const params = [];
    const sets = Object.keys(clean).map((key) => {
      params.push(clean[key]);
      return `${qIdent(key)} = $${params.length}`;
    });
    if (TABLES[table].includes("updated_at")) sets.push("updated_at = now()");
    const where = buildWhere(table, filters, params);
    if (!where) throw new HttpError(400, "Filtro obrigatório para atualização");

    const updated = await withTransaction(async (client) => {
      if (table === "backup_settings" && clean.config !== undefined) {
        // Mantém segredos já gravados quando o formulário manda o campo vazio.
        const prevParams = [];
        const prevWhere = buildWhere(table, filters, prevParams);
        const prev = await client.query(`SELECT config FROM backup_settings WHERE ${prevWhere}`, prevParams);
        const idx = Object.keys(clean).indexOf("config");
        params[idx] = JSON.stringify(sealConfig(JSON.parse(clean.config), prev.rows[0]?.config || {}));
      }
      const result = await client.query(`UPDATE ${qIdent(table)} SET ${sets.join(", ")} WHERE ${where} RETURNING *`, params);
      if (table === "user_roles") await assertAdminRemains(client);
      return result.rows;
    });

    await auditWrite(req, table, "update", updated, Object.keys(clean));
    const rows = await presentRows(req, table, updated);
    const data = req.body?.single ? (rows[0] || null) : rows;
    res.json({ data: projectSelection(table, data, req.body?.select || "*") });
  }));

  app.delete("/api/table/:table", requireAuth, wrap(async (req, res) => {
    const table = req.params.table;
    if (!TABLES[table]) throw new HttpError(404, "Tabela não suportada");
    const filters = parseFilters(req.body?.filters);
    if (!canWriteTable(req.authUser, table, filters, {}, "delete")) throw new HttpError(403, "Sem permissão");

    const params = [];
    const where = buildWhere(table, filters, params);
    if (!where) throw new HttpError(400, "Filtro obrigatório para remoção");

    const removed = await withTransaction(async (client) => {
      const result = await client.query(`DELETE FROM ${qIdent(table)} WHERE ${where} RETURNING *`, params);
      if (table === "user_roles") await assertAdminRemains(client);
      return result.rows;
    });

    await auditWrite(req, table, "delete", removed);
    // Não devolve o conteúdo apagado (poderia incluir dados completos).
    const data = removed.map((r) => ({ id: r.id }));
    res.json({ data: req.body?.single ? (data[0] || null) : data });
  }));

  // --- Cópias de versão e envio a destinos (tudo no servidor) --------------------

  app.post("/api/backups/database/:id", requireAuth, requireEditor, wrap(async (req, res) => {
    const reason = String(req.body?.reason || "manual").slice(0, 60);
    const result = await backupDatabase(req.params.id, reason, req.authUser.id);
    await audit(req, { action: "backup_created", entityType: "database", entityId: req.params.id, details: { reason, versions: result.versions, created: result.created.length } });
    res.json({ data: result });
  }));

  app.post("/api/backups/version/:id", requireAuth, requireEditor, wrap(async (req, res) => {
    const reason = String(req.body?.reason || "manual").slice(0, 60);
    const created = await withTransaction((client) => backupVersion(client, req.params.id, reason, req.authUser.id));
    if (!created) throw new HttpError(404, "Versão não encontrada");
    await audit(req, { action: "backup_created", entityType: "version", entityId: req.params.id, details: { reason, backup_id: created.id } });
    res.json({ data: created });
  }));

  app.post("/api/backups/:id/restore", requireAuth, requireEditor, wrap(async (req, res) => {
    const result = await restoreBackup(req.params.id);
    if (!result) throw new HttpError(404, "Backup não encontrado");
    await audit(req, { action: "backup_restored", entityType: "backup", entityId: req.params.id, details: { version_name: result.backup.version_name, version_id: result.version?.id } });
    res.json({ data: result });
  }));

  app.post("/api/backups/send/:versionId", requireAuth, requireEditor, wrap(async (req, res) => {
    const results = await sendVersionToDestinations(req.params.versionId);
    if (!results) throw new HttpError(404, "Versão não encontrada");
    await audit(req, { action: "backup_sent", entityType: "version", entityId: req.params.versionId, details: { results } });
    res.json({ data: results });
  }));

  // Admin: encerrar todas as sessões de um usuário (ex.: notebook perdido).
  app.post("/api/admin/users/:id/revoke-sessions", requireAuth, requireAdmin, wrap(async (req, res) => {
    await revokeSessions(req.params.id);
    await audit(req, { action: "sessions_revoked_by_admin", entityType: "user", entityId: req.params.id });
    res.json({ data: { ok: true } });
  }));

  // --- Frontend estático (modo Windows / processo único) ---------------------------
  const distPath = config.frontendDistPath
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../dist");
  if (distPath && fs.existsSync(path.join(distPath, "index.html"))) {
    app.use(express.static(distPath, { index: false, maxAge: "1h" }));
    app.get(/^(?!\/api\/|\/auth\/|\/health).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(distPath, "index.html"));
    });
    if (!config.isTest) console.log(`Servindo frontend estático de ${distPath}`);
  }

  app.use((req, res) => res.status(404).json({ error: "Rota não encontrada" }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
    if (err?.type === "entity.too.large") return res.status(413).json({ error: `Envio maior que o limite (${config.bodyLimit})` });
    if (err?.type === "entity.parse.failed") return res.status(400).json({ error: "JSON inválido" });
    if (err?.code === "23505") return res.status(409).json({ error: "Registro duplicado" });
    if (err?.code === "23503") return res.status(400).json({ error: "Referência inválida" });
    if (err?.code === "22P02") return res.status(400).json({ error: "Valor inválido" });
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Erro interno" });
  });

  return app;
}

// --- Auxiliares -------------------------------------------------------------------

function parseFilters(raw) {
  if (!raw) return [];
  let parsed = raw;
  if (!Array.isArray(raw)) {
    try { parsed = JSON.parse(String(raw)); } catch { return []; }
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((f) => f && typeof f === "object" && !Array.isArray(f));
}

function qIdent(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function sanitizeColumns(table, select) {
  const allowed = TABLES[table];
  if (!select || select === "*") return "*";
  const cols = String(select).split(",").map((p) => p.trim()).filter((c) => allowed.includes(c));
  return cols.length ? cols.map(qIdent).join(", ") : "*";
}

function sanitizePayload(table, payload) {
  const allowed = new Set(TABLES[table]);
  const jsonCols = new Set(JSON_COLUMNS[table] || []);
  const clean = {};
  for (const [key, value] of Object.entries(payload || {})) {
    if (!allowed.has(key)) continue;
    clean[key] = jsonCols.has(key) ? (value == null ? null : JSON.stringify(value)) : value;
  }
  return clean;
}

function buildWhere(table, filters, params) {
  const allowed = new Set(TABLES[table] || []);
  const valid = (filters || []).filter((f) => f?.op === "eq" && f?.field && allowed.has(f.field));
  if (!valid.length) return "";
  return valid.map((f) => {
    params.push(f.value);
    return `${qIdent(f.field)} = $${params.length}`;
  }).join(" AND ");
}

function projectSelection(table, data, select) {
  if (!data || select === "*" || !select) return data;
  const cols = String(select).split(",").map((p) => p.trim()).filter((c) => TABLES[table].includes(c));
  if (!cols.length) return data;
  const pick = (row) => Object.fromEntries(cols.map((c) => [c, row?.[c]]));
  return Array.isArray(data) ? data.map(pick) : pick(data);
}

/** Campos que o servidor define em inserções, ignorando o que o cliente mandou. */
function prepareInsert(req, table, row) {
  const out = { ...row };
  for (const field of SERVER_MANAGED[table] || []) delete out[field];
  delete out.id;
  if (TABLES[table].includes("created_by")) out.created_by = req.authUser.id;
  if (table === "activity_log") {
    out.user_name = req.authUser.full_name || req.authUser.email || "";
    out.source = "client";
    out.ip = clientIp(req);
  }
  if (table === "database_versions" && Array.isArray(out.data)) out.row_count = out.data.length;
  return out;
}

async function assertAdminRemains(client) {
  const { rows } = await client.query("SELECT count(*)::int AS n FROM user_roles WHERE role = 'admin'");
  if (rows[0].n < 1) throw new HttpError(400, "Operação bloqueada: o sistema precisa de pelo menos um administrador");
}

/** Prepara as linhas para sair na resposta: máscara LGPD e segredos ocultos. */
async function presentRows(req, table, rows) {
  if (!rows?.length) return rows || [];
  if (table === "backup_settings") return rows.map((r) => (r.config ? { ...r, config: redactConfig(r.config) } : r));
  if ((table === "database_versions" || table === "version_backups") && !canSeeUnmasked(req.authUser)) {
    const withData = rows.filter((r) => Array.isArray(r.data) && r.data.length);
    if (!withData.length) return rows;
    const dbIds = [...new Set(withData.map((r) => r.database_id).filter(Boolean))];
    let vars = [];
    if (dbIds.length) {
      const v = await query("SELECT database_id, name, identifying FROM database_variables WHERE database_id = ANY($1::uuid[])", [dbIds]);
      vars = v.rows;
    }
    return rows.map((r) => {
      if (!Array.isArray(r.data)) return r;
      // Sem database_id na seleção, usa só a detecção por nome.
      const scoped = r.database_id ? vars.filter((v) => v.database_id === r.database_id) : [];
      return { ...r, data: maskDataArray(r.data, scoped) };
    });
  }
  return rows;
}

async function auditSensitiveRead(req, table, rows) {
  if (table !== "database_versions" && table !== "version_backups") return;
  const withData = rows.filter((r) => Array.isArray(r.data) && r.data.length);
  if (!withData.length) return;
  const dbIds = [...new Set(withData.map((r) => r.database_id).filter(Boolean))].sort();
  const key = `${table}:${dbIds.join(",") || withData.map((r) => r.id).join(",")}`;
  if (!shouldLogView(req.authUser.id, key)) return;
  await audit(req, {
    action: "sensitive_data_view",
    entityType: table === "database_versions" ? "version" : "backup",
    entityId: dbIds.length === 1 ? dbIds[0] : null,
    details: {
      table,
      database_ids: dbIds,
      versions: withData.length,
      records: withData.reduce((n, r) => n + r.data.length, 0),
      masked: !canSeeUnmasked(req.authUser),
    },
  });
}

const AUDITED_TABLES = new Set([...DATA_TABLES, "profiles", "user_roles", "backup_settings"]);

async function auditWrite(req, table, op, rows, changedFields = []) {
  if (!AUDITED_TABLES.has(table) || !rows?.length) return;
  const summary = rows.slice(0, 50).map((r) => {
    const s = { id: r.id };
    if (r.name) s.name = r.name;
    if (r.label) s.label = r.label;
    if (r.user_id) s.user_id = r.user_id;
    if (table === "user_roles") s.role = r.role;
    if (table === "profiles" && changedFields.includes("approved")) s.approved = r.approved;
    if (r.database_id) s.database_id = r.database_id;
    if (typeof r.row_count === "number") s.row_count = r.row_count;
    return s;
  });
  await audit(req, {
    action: `${table}_${op}`,
    entityType: table,
    entityId: rows.length === 1 ? rows[0].id : null,
    details: { count: rows.length, fields: changedFields, rows: summary },
  });
}
