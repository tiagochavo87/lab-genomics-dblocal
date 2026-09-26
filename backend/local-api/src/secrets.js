// Cifra segredos guardados no banco (ex.: token/senha dos destinos de backup)
// com AES-256-GCM. Na leitura pela API, o segredo nunca volta ao navegador.
import crypto from "crypto";
import { config } from "./config.js";

export const SECRET_FIELDS = ["auth_token", "password", "api_key", "secret", "token"];
const PREFIX = "enc:v1:";

function key() {
  const base = config.settingsEncryptionKey || `dblapoge-settings:${config.jwtSecret}`;
  return crypto.createHash("sha256").update(base).digest();
}

export function encryptSecret(plain) {
  if (plain === null || plain === undefined || plain === "") return plain;
  if (typeof plain === "string" && plain.startsWith(PREFIX)) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) return value;
  const raw = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Cifra os campos secretos de um config; campos vazios mantêm o valor anterior. */
export function sealConfig(incoming = {}, previous = {}) {
  const out = { ...(incoming || {}) };
  for (const field of SECRET_FIELDS) {
    delete out[`${field}__set`];
    const value = incoming?.[field];
    if (value === undefined || value === "") {
      if (previous && previous[field]) out[field] = previous[field];
      else delete out[field];
    } else {
      out[field] = encryptSecret(value);
    }
  }
  return out;
}

/** Versão do config que pode ir ao navegador: sem os segredos. */
export function redactConfig(cfg = {}) {
  const out = { ...(cfg || {}) };
  for (const field of SECRET_FIELDS) {
    if (out[field]) {
      out[field] = "";
      out[`${field}__set`] = true;
    }
  }
  return out;
}

export function openConfig(cfg = {}) {
  const out = { ...(cfg || {}) };
  for (const field of SECRET_FIELDS) if (out[field]) out[field] = decryptSecret(out[field]);
  return out;
}
