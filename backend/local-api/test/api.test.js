// Testes de integração da API contra um PostgreSQL real.
// Uso: TEST_DATABASE_URL=postgres://.../dblapoge_test npm test
// ATENÇÃO: o banco indicado é APAGADO no início. O nome precisa conter "test".
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

const TEST_DB = process.env.TEST_DATABASE_URL;
if (!TEST_DB || !/test/i.test(TEST_DB)) {
  console.error("Defina TEST_DATABASE_URL apontando para um banco cujo nome contenha 'test'.");
  process.exit(1);
}

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: TEST_DB,
  JWT_SECRET: "test-secret-0123456789abcdef0123456789abcdef",
  INITIAL_ADMIN_EMAIL: "Admin@Lab.test",
  INITIAL_ADMIN_PASSWORD: "Admin-Senha-Forte-1",
  INITIAL_ADMIN_NAME: "Admin",
  FRONTEND_DIST_PATH: "/nao/existe",
  RATE_LIMIT_AUTH: "1000",
  RATE_LIMIT_STRICT: "1000",
  SMTP_HOST: "",
});

let server;
let base;
let db;

async function call(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* html */ }
  return { status: res.status, body: json, headers: res.headers };
}

const get = (table, token, params = {}) => {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) qs.set(k, typeof v === "string" ? v : JSON.stringify(v));
  return call("GET", `/api/table/${table}?${qs}`, { token });
};
const eq = (field, value) => ({ field, op: "eq", value });

async function login(email, password) {
  const r = await call("POST", "/auth/login", { body: { email, password } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return { token: r.body.data.access_token, id: r.body.data.user.id };
}

async function register(email, password = "Senha-Boa-123", name = email) {
  const r = await call("POST", "/auth/register", { body: { email, password, metadata: { full_name: name } } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return login(email, password);
}

let admin, mod, user, pending, dbId, versionId;

before(async () => {
  db = new pg.Client({ connectionString: TEST_DB });
  await db.connect();
  await db.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");

  const { initDb } = await import("../src/db.js");
  const { ensureInitialAdmin } = await import("../src/auth.js");
  const { createApp } = await import("../src/app.js");
  await initDb();
  await ensureInitialAdmin();
  server = createApp().listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;

  admin = await login("admin@lab.test", "Admin-Senha-Forte-1");
  mod = await register("moderador@lab.test");
  user = await register("usuario@lab.test");
  pending = await register("pendente@x.com");

  for (const u of [mod, user]) {
    const r = await call("PATCH", "/api/table/profiles", { token: admin.token, body: { values: { approved: true }, filters: [eq("user_id", u.id)] } });
    assert.equal(r.status, 200);
  }
  await call("PATCH", "/api/table/user_roles", { token: admin.token, body: { values: { role: "moderator" }, filters: [eq("user_id", mod.id)] } });

  const created = await call("POST", "/api/table/disease_databases", { token: mod.token, body: { values: { name: "MM", disease: "Mieloma", created_by: "forjado" }, single: true } });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  dbId = created.body.data.id;
  assert.equal(created.body.data.created_by, mod.id, "created_by deve ser definido pelo servidor");

  // Classificação LGPD explícita só pode ser definida por admin.
  const vars = await call("POST", "/api/table/database_variables", { token: admin.token, body: { values: [
    { database_id: dbId, name: "Nome_Paciente" },
    { database_id: dbId, name: "cirurgia" },
    { database_id: dbId, name: "registro_amostra", identifying: false },
    { database_id: dbId, name: "genotipo_x", identifying: true },
  ] } });
  assert.equal(vars.status, 200, JSON.stringify(vars.body));

  const v = await call("POST", "/api/table/database_versions", { token: mod.token, body: { values: {
    database_id: dbId, name: "v1", version_number: "1",
    data: [
      { Nome_Paciente: "Maria da Silva", cirurgia: "sim", registro_amostra: "A001", genotipo_x: "AG", DataNascimento: "1970-01-01" },
      { Nome_Paciente: "João Souza", cirurgia: "não", registro_amostra: "A002", genotipo_x: "GG", DataNascimento: "1980-02-02" },
    ],
  }, single: true } });
  assert.equal(v.status, 200, JSON.stringify(v.body));
  versionId = v.body.data.id;
});

after(async () => {
  server?.close();
  await db?.end();
  const { pool } = await import("../src/db.js");
  await pool.end();
});

test("e-mail é normalizado e o login não diferencia maiúsculas", async () => {
  const r = await call("POST", "/auth/login", { body: { email: "  USUARIO@LAB.TEST ", password: "Senha-Boa-123" } });
  assert.equal(r.status, 200);
  const dup = await call("POST", "/auth/register", { body: { email: "Usuario@Lab.Test", password: "Outra-Senha-99" } });
  assert.equal(dup.status, 409);
});

test("política de senha no cadastro", async () => {
  const r = await call("POST", "/auth/register", { body: { email: "fraca@lab.test", password: "123456" } });
  assert.equal(r.status, 400);
  const r2 = await call("POST", "/auth/register", { body: { email: "invalido", password: "Senha-Boa-123" } });
  assert.equal(r2.status, 400);
});

test("usuário não aprovado não lê dados de pesquisa", async () => {
  const r = await get("database_versions", pending.token);
  assert.equal(r.status, 403);
});

test("filtro com op diferente de eq não burla a permissão (C1)", async () => {
  const f = [{ field: "user_id", op: "x", value: pending.id }];
  for (const table of ["profiles", "activity_log", "user_roles"]) {
    const r = await get(table, pending.token, { filters: f });
    assert.equal(r.status, 403, table);
  }
  const del = await call("DELETE", "/api/table/profiles", { token: pending.token, body: { filters: [...f, eq("user_id", admin.id)] } });
  assert.equal(del.status, 403);
  const own = await call("DELETE", "/api/table/profiles", { token: pending.token, body: { filters: [eq("user_id", pending.id)] } });
  assert.equal(own.status, 403, "usuário comum não apaga nem o próprio perfil");
});

test("filtros malformados não derrubam a API (C2)", async () => {
  for (const f of ["{}", '"x"', "[null,1,\"a\"]", "{{{"]) {
    const r = await call("GET", `/api/table/profiles?filters=${encodeURIComponent(f)}`, { token: pending.token });
    assert.ok([400, 403].includes(r.status), `${f} -> ${r.status}`);
  }
  const h = await call("GET", "/health");
  assert.equal(h.status, 200);
});

test("usuário comum não se autoaprova nem muda de dono", async () => {
  const r = await call("PATCH", "/api/table/profiles", { token: pending.token, body: { values: { approved: true, full_name: "Novo Nome" }, filters: [eq("user_id", pending.id)], single: true } });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.approved, false);
  assert.equal(r.body.data.full_name, "Novo Nome");
});

test("log de auditoria é append-only, inclusive para admin (A1)", async () => {
  const ins = await call("POST", "/api/table/activity_log", { token: user.token, body: { values: { user_id: user.id, action: "teste", user_name: "Forjado", source: "server" }, single: true } });
  assert.equal(ins.status, 200);
  assert.equal(ins.body.data.source, "client");
  assert.notEqual(ins.body.data.user_name, "Forjado");
  const other = await call("POST", "/api/table/activity_log", { token: user.token, body: { values: { user_id: admin.id, action: "forjado" } } });
  assert.equal(other.status, 403);
  for (const token of [user.token, admin.token]) {
    const up = await call("PATCH", "/api/table/activity_log", { token, body: { values: { user_id: user.id, action: "x" }, filters: [eq("id", ins.body.data.id)] } });
    assert.equal(up.status, 403);
    const del = await call("DELETE", "/api/table/activity_log", { token, body: { filters: [eq("id", ins.body.data.id)] } });
    assert.equal(del.status, 403);
  }
});

test("máscara LGPD é aplicada no servidor para não-admin", async () => {
  const r = await get("database_versions", user.token, { filters: [eq("id", versionId)], single: "true" });
  assert.equal(r.status, 200);
  const row = r.body.data.data[0];
  assert.notEqual(row.Nome_Paciente, "Maria da Silva");
  assert.match(row.Nome_Paciente, /^M\*+a$/);
  assert.notEqual(row.DataNascimento, "1970-01-01", "detecção por nome em camelCase");
  assert.equal(row.cirurgia, "sim", "'cirurgia' não é falso positivo de 'rg'");
  assert.equal(row.registro_amostra, "A001", "marcação explícita identifying=false prevalece");
  assert.notEqual(row.genotipo_x, "AG", "marcação explícita identifying=true prevalece");

  const m = await get("database_versions", mod.token, { filters: [eq("id", versionId)], single: "true" });
  assert.notEqual(m.body.data.data[0].Nome_Paciente, "Maria da Silva", "moderador também vê mascarado");

  const a = await get("database_versions", admin.token, { filters: [eq("id", versionId)], single: "true" });
  assert.equal(a.body.data.data[0].Nome_Paciente, "Maria da Silva");
});

test("select só de data não burla a classificação explícita da variável", async () => {
  const r = await get("database_versions", user.token, { select: "data", filters: [eq("id", versionId)], single: "true" });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body.data), ["data"]);
  assert.notEqual(r.body.data.data[0].genotipo_x, "AG");
  assert.equal(r.body.data.data[0].registro_amostra, "A001");
});

test("moderador não altera a classificação LGPD das variáveis", async () => {
  const { rows } = await db.query("SELECT id FROM database_variables WHERE name = 'Nome_Paciente'");
  const r = await call("PATCH", "/api/table/database_variables", { token: mod.token, body: { values: { identifying: false }, filters: [eq("id", rows[0].id)] } });
  assert.equal(r.status, 403);
  const ins = await call("POST", "/api/table/database_variables", { token: mod.token, body: { values: { database_id: dbId, name: "Nome2", identifying: false } } });
  assert.equal(ins.status, 403);
  const ok = await call("PATCH", "/api/table/database_variables", { token: mod.token, body: { values: { description: "nome" }, filters: [eq("id", rows[0].id)] } });
  assert.equal(ok.status, 200);
  const adm = await call("PATCH", "/api/table/database_variables", { token: admin.token, body: { values: { identifying: true }, filters: [eq("id", rows[0].id)] } });
  assert.equal(adm.status, 200);
});

test("visualização de dado sensível gera auditoria do servidor", async () => {
  const { rows } = await db.query("SELECT * FROM activity_log WHERE action = 'sensitive_data_view' AND user_id = $1", [user.id]);
  assert.ok(rows.length >= 1);
  assert.equal(rows[0].source, "server");
  assert.equal(rows[0].details.masked, true);
});

test("moderador não sobrescreve o conteúdo de uma versão", async () => {
  const r = await call("PATCH", "/api/table/database_versions", { token: mod.token, body: { values: { data: [{ Nome_Paciente: "M*****a" }] }, filters: [eq("id", versionId)] } });
  assert.equal(r.status, 403);
  const rename = await call("PATCH", "/api/table/database_versions", { token: mod.token, body: { values: { name: "v1 revisada" }, filters: [eq("id", versionId)], single: true } });
  assert.equal(rename.status, 200);
  assert.notEqual(rename.body.data.data[0].Nome_Paciente, "Maria da Silva", "resposta de escrita também é mascarada");
});

test("backup e restauração pelo servidor preservam o dado real", async () => {
  const b = await call("POST", `/api/backups/version/${versionId}`, { token: mod.token, body: { reason: "manual" } });
  assert.equal(b.status, 200, JSON.stringify(b.body));
  const direct = await call("POST", "/api/table/version_backups", { token: mod.token, body: { values: { version_id: versionId, database_id: dbId, version_name: "x", version_number: "1", data: [] } } });
  assert.equal(direct.status, 403, "cópia só pelas rotas do servidor");

  await db.query("UPDATE database_versions SET data = '[]'::jsonb, row_count = 0 WHERE id = $1", [versionId]);
  const rest = await call("POST", `/api/backups/${b.body.data.id}/restore`, { token: mod.token });
  assert.equal(rest.status, 200, JSON.stringify(rest.body));
  const { rows } = await db.query("SELECT data, row_count FROM database_versions WHERE id = $1", [versionId]);
  assert.equal(rows[0].data[0].Nome_Paciente, "Maria da Silva");
  assert.equal(rows[0].row_count, 2);

  const all = await call("POST", `/api/backups/database/${dbId}`, { token: user.token, body: { reason: "x" } });
  assert.equal(all.status, 403, "usuário comum não cria backup");
});

test("segredos dos destinos de backup são cifrados e nunca voltam ao navegador", async () => {
  const c = await call("POST", "/api/table/backup_settings", { token: admin.token, body: { values: { setting_type: "university_server", label: "UFSC", config: { server_url: "https://exemplo.invalid", username: "lab", password: "segredo-123" } }, single: true } });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.data.config.password, "");
  assert.equal(c.body.data.config.password__set, true);
  const { rows } = await db.query("SELECT config FROM backup_settings WHERE id = $1", [c.body.data.id]);
  assert.match(rows[0].config.password, /^enc:v1:/);

  const u = await call("PATCH", "/api/table/backup_settings", { token: admin.token, body: { values: { config: { server_url: "https://outro.invalid", username: "lab", password: "" } }, filters: [eq("id", c.body.data.id)] } });
  assert.equal(u.status, 200);
  const after2 = await db.query("SELECT config FROM backup_settings WHERE id = $1", [c.body.data.id]);
  assert.equal(after2.rows[0].config.password, rows[0].config.password, "senha vazia no formulário mantém a anterior");
  assert.equal(after2.rows[0].config.server_url, "https://outro.invalid");

  const { openConfig } = await import("../src/secrets.js");
  assert.equal(openConfig(after2.rows[0].config).password, "segredo-123");
});

test("não é possível remover o último administrador", async () => {
  const r = await call("PATCH", "/api/table/user_roles", { token: admin.token, body: { values: { role: "user" }, filters: [eq("user_id", admin.id)] } });
  assert.equal(r.status, 400);
  const { rows } = await db.query("SELECT role FROM user_roles WHERE user_id = $1", [admin.id]);
  assert.equal(rows[0].role, "admin");
});

test("troca de senha exige a senha atual e derruba as outras sessões", async () => {
  const s = await register("sessao@lab.test", "Senha-Antiga-1");
  const other = await login("sessao@lab.test", "Senha-Antiga-1");
  const bad = await call("PATCH", "/auth/user", { token: s.token, body: { password: "Senha-Nova-12", current_password: "errada" } });
  assert.equal(bad.status, 400);
  const ok = await call("PATCH", "/auth/user", { token: s.token, body: { password: "Senha-Nova-12", current_password: "Senha-Antiga-1" } });
  assert.equal(ok.status, 200);
  const old = await call("GET", "/auth/session", { token: other.token });
  assert.equal(old.status, 401, "token antigo revogado");
  const fresh = await call("GET", "/auth/session", { token: ok.body.data.access_token });
  assert.equal(fresh.status, 200, "token devolvido na troca continua válido");
});

test("reset de senha: token não volta na resposta, é guardado com hash e é de uso único", async () => {
  await register("reset@lab.test", "Senha-Antiga-1");
  const r1 = await call("POST", "/auth/reset-password/request", { body: { email: "RESET@lab.test" } });
  assert.equal(r1.status, 200);
  assert.deepEqual(r1.body, { data: { ok: true } });
  const link1 = globalThis.__lastResetLink;
  const token1 = new URL(link1).searchParams.get("token");
  const { rows } = await db.query("SELECT token FROM password_reset_tokens WHERE token = $1", [token1]);
  assert.equal(rows.length, 0, "token em texto puro não fica no banco");

  await call("POST", "/auth/reset-password/request", { body: { email: "reset@lab.test" } });
  const token2 = new URL(globalThis.__lastResetLink).searchParams.get("token");
  const old = await call("POST", "/auth/reset-password/confirm", { body: { token: token1, password: "Senha-Nova-123" } });
  assert.equal(old.status, 400, "pedido novo invalida o anterior");
  const ok = await call("POST", "/auth/reset-password/confirm", { body: { token: token2, password: "Senha-Nova-123" } });
  assert.equal(ok.status, 200);
  const again = await call("POST", "/auth/reset-password/confirm", { body: { token: token2, password: "Outra-Senha-123" } });
  assert.equal(again.status, 400, "uso único");
  await login("reset@lab.test", "Senha-Nova-123");

  const unknown = await call("POST", "/auth/reset-password/request", { body: { email: "naoexiste@lab.test" } });
  assert.deepEqual(unknown.body, { data: { ok: true } }, "resposta idêntica para e-mail inexistente");
});

test("X-Forwarded-For é ignorado sem TRUST_PROXY (rate limit não é burlável)", async () => {
  const r = await call("POST", "/api/table/activity_log", { token: user.token, headers: { "X-Forwarded-For": "6.6.6.6" }, body: { values: { user_id: user.id, action: "ip" }, single: true } });
  assert.notEqual(r.body.data.ip, "6.6.6.6");
});

test("cabeçalhos: sem upgrade-insecure-requests nem HSTS em HTTP", async () => {
  const r = await call("GET", "/health");
  const csp = r.headers.get("content-security-policy");
  assert.ok(csp && !csp.includes("upgrade-insecure-requests"));
  assert.equal(r.headers.get("strict-transport-security"), null);
});

test("apagar dados não devolve o conteúdo removido", async () => {
  const d = await call("POST", "/api/table/disease_databases", { token: mod.token, body: { values: { name: "Tmp", disease: "x" }, single: true } });
  const del = await call("DELETE", "/api/table/disease_databases", { token: mod.token, body: { filters: [eq("id", d.body.data.id)] } });
  assert.equal(del.status, 200);
  assert.deepEqual(Object.keys(del.body.data[0]), ["id"]);
  const { rows } = await db.query("SELECT details FROM activity_log WHERE action = 'disease_databases_delete' AND source = 'server'");
  assert.equal(rows.length, 1);
});
