#!/usr/bin/env node
// Verificação rápida de um servidor DBLAPOGE já instalado. Não precisa de
// nenhuma dependência (só Node 18+). Não altera dados.
//
//   node scripts/testar-servidor.mjs https://meu-dominio.org admin@lab.org 'senha'
//   node scripts/testar-servidor.mjs http://192.168.0.10:8080
//
// Para certificado próprio (instalação Windows com -Https) sem ter instalado
// o certificado neste PC: NODE_TLS_REJECT_UNAUTHORIZED=0 node scripts/...

const [baseArg, email, password] = process.argv.slice(2);
if (!baseArg) {
  console.log("Uso: node scripts/testar-servidor.mjs <url> [email-admin] [senha]");
  process.exit(2);
}
const base = baseArg.replace(/\/+$/, "");
const results = [];
const ok = (name, detail = "") => results.push({ ok: true, name, detail });
const fail = (name, detail = "") => results.push({ ok: false, name, detail });
const warn = (name, detail = "") => results.push({ ok: null, name, detail });

async function req(path, opts = {}) {
  const res = await fetch(base + path, { redirect: "manual", ...opts, signal: AbortSignal.timeout(15000) });
  let body = null;
  const text = await res.text();
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, headers: res.headers, body };
}

async function main() {
  const https = base.startsWith("https://");

  // 1. Saúde
  try {
    const h = await req("/health");
    if (h.status === 200 && h.body?.ok) ok("API respondendo", `versão ${h.body.version ?? "?"}, banco ${h.body.db ?? "?"}`);
    else fail("API respondendo", `status ${h.status}`);
    if (h.body?.version !== "2.0.0") warn("Versão da API", `esperado 2.0.0, recebido ${h.body?.version ?? "desconhecida (v1?)"}`);
  } catch (e) {
    fail("API respondendo", e.cause?.code || e.message);
    return;
  }

  // 2. Frontend e cabeçalhos
  const home = await req("/");
  if (home.status === 200 && String(home.body).includes('id="root"')) ok("Frontend servido");
  else fail("Frontend servido", `status ${home.status}`);

  const api = await req("/api/table/profiles");
  const csp = api.headers.get("content-security-policy") || "";
  if (csp) ok("Content-Security-Policy presente"); else fail("Content-Security-Policy presente");
  if (!https && csp.includes("upgrade-insecure-requests")) fail("CSP compatível com HTTP", "upgrade-insecure-requests em HTTP deixa a página em branco");
  if (api.headers.get("x-content-type-options") === "nosniff") ok("X-Content-Type-Options"); else fail("X-Content-Type-Options");
  if (https) {
    if (api.headers.get("strict-transport-security")) ok("HSTS (HTTPS)"); else warn("HSTS (HTTPS)", "ausente");
    try {
      const plain = await fetch(base.replace("https://", "http://") + "/health", { redirect: "manual", signal: AbortSignal.timeout(8000) });
      if ([301, 302, 307, 308].includes(plain.status)) ok("HTTP redireciona para HTTPS");
      else warn("HTTP redireciona para HTTPS", `status ${plain.status}`);
    } catch { ok("HTTP simples fechado"); }
  } else {
    warn("Tráfego sem HTTPS", "senhas e dados trafegam sem criptografia; aceitável só em rede interna confiável");
  }

  // 3. Autorização básica
  if (api.status === 401) ok("API exige login"); else fail("API exige login", `status ${api.status}`);
  const bad = await req("/api/table/profiles?filters=%7B%7D", { headers: { Authorization: "Bearer invalido" } });
  if (bad.status === 401) ok("Token inválido recusado"); else fail("Token inválido recusado", `status ${bad.status}`);
  const reset = await req("/auth/reset-password/request", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "naoexiste@exemplo.invalid" }),
  });
  if (reset.status === 200 && JSON.stringify(reset.body) === JSON.stringify({ data: { ok: true } })) ok("Reset de senha não vaza token");
  else if (reset.status === 429) warn("Reset de senha", "limite de tentativas atingido; rode de novo em 15 min");
  else fail("Reset de senha não vaza token", JSON.stringify(reset.body).slice(0, 120));

  // 4. Com credenciais de admin
  if (email && password) {
    const login = await req("/auth/login", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }),
    });
    if (login.status !== 200) { fail("Login do admin", `status ${login.status}`); return; }
    ok("Login do admin");
    const auth = { Authorization: `Bearer ${login.body.data.access_token}` };

    for (const f of ["{}", "[null]", "{{"]) {
      await req(`/api/table/profiles?filters=${encodeURIComponent(f)}`, { headers: auth });
    }
    const after = await req("/health");
    if (after.status === 200) ok("Filtros malformados não derrubam a API"); else fail("Filtros malformados não derrubam a API");

    const logs = await req(`/api/table/activity_log?order=${encodeURIComponent(JSON.stringify({ column: "created_at", ascending: false }))}&limit=50`, { headers: auth });
    const serverLogs = Array.isArray(logs.body?.data) ? logs.body.data.filter((l) => l.source === "server") : [];
    if (serverLogs.length) ok("Auditoria do servidor ativa", `${serverLogs.length} eventos recentes`);
    else fail("Auditoria do servidor ativa");

    const tamper = await req("/api/table/activity_log", {
      method: "DELETE", headers: { ...auth, "content-type": "application/json" },
      body: JSON.stringify({ filters: [{ field: "id", op: "eq", value: serverLogs[0]?.id ?? "x" }] }),
    });
    if (tamper.status === 403) ok("Log de auditoria não pode ser apagado"); else fail("Log de auditoria não pode ser apagado", `status ${tamper.status}`);

    const settings = await req("/api/table/backup_settings", { headers: auth });
    const leaks = (settings.body?.data || []).filter((s) => ["password", "auth_token"].some((k) => s.config?.[k]));
    if (!leaks.length) ok("Segredos de backup não saem do servidor"); else fail("Segredos de backup não saem do servidor");
  } else {
    warn("Testes com login", "informe email e senha do admin para testar mais itens");
  }
}

await main().catch((e) => fail("Execução", e.message));
let failures = 0;
for (const r of results) {
  const mark = r.ok === true ? "\x1b[32m✔\x1b[0m" : r.ok === false ? "\x1b[31m✘\x1b[0m" : "\x1b[33m!\x1b[0m";
  if (r.ok === false) failures++;
  console.log(`${mark} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
}
console.log(failures ? `\n${failures} falha(s).` : "\nTudo certo.");
process.exit(failures ? 1 : 0);
