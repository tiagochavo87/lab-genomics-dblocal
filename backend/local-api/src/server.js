import fs from "fs";
import http from "http";
import https from "https";
import { config, assertSecureConfig } from "./config.js";

assertSecureConfig();

const { createApp } = await import("./app.js");
const { initDb, pool } = await import("./db.js");
const { ensureInitialAdmin } = await import("./auth.js");

process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

await initDb();
await ensureInitialAdmin();

const app = createApp();

// HTTPS direto no Node (modo Windows com -Https): certificado .pfx gerado
// pelo instalador. No modo Docker o HTTPS fica com o Caddy.
let server;
if (config.httpsPfxPath) {
  const pfx = fs.readFileSync(config.httpsPfxPath);
  server = https.createServer({ pfx, passphrase: config.httpsPfxPassphrase }, app);
} else {
  server = http.createServer(app);
}

server.listen(config.port, () => {
  console.log(`DBLAPOGE API v2.0.0 ouvindo na porta ${config.port} (${config.httpsPfxPath ? "HTTPS" : "HTTP"})`);
});

function shutdown(signal) {
  console.log(`${signal} recebido, encerrando...`);
  server.close(() => pool.end().finally(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
