import pg from "pg";
import { config } from "./config.js";
import { runMigrations } from "./schema.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: Number(process.env.PG_POOL_MAX || 10),
});

pool.on("error", (err) => {
  // Erro em conexão ociosa (ex.: Postgres reiniciou): registra e segue; o
  // pool abre outra conexão no próximo uso em vez de derrubar o processo.
  console.error("[pg] erro em conexão ociosa:", err.message);
});

export async function initDb() {
  const client = await pool.connect();
  try {
    await runMigrations(client);
  } finally {
    client.release();
  }
}

export async function query(text, params = []) {
  return pool.query(text, params);
}

/** Executa fn(client) numa transação; faz ROLLBACK se fn lançar erro. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
