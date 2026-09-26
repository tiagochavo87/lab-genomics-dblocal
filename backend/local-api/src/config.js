// Configuração centralizada, lida das variáveis de ambiente (.env).
import dotenv from "dotenv";

dotenv.config({ quiet: true });

function bool(value, fallback = false) {
  if (value === undefined || value === "") return fallback;
  return ["1", "true", "yes", "sim"].includes(String(value).toLowerCase());
}

function list(value, fallback = []) {
  if (!value) return fallback;
  return String(value).split(",").map((s) => s.trim()).filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3001),
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "12h",
  corsOrigins: list(process.env.CORS_ORIGIN, ["http://localhost:8080"]),
  publicAppUrl: process.env.PUBLIC_APP_URL || "http://localhost:8080/reset-password",
  // Só confie em X-Forwarded-For quando houver um proxy reverso na frente.
  trustProxy: process.env.TRUST_PROXY || "",
  // true quando o acesso é por HTTPS (Caddy ou certificado próprio do Node):
  // liga HSTS e upgrade-insecure-requests.
  https: bool(process.env.HTTPS),
  httpsPfxPath: process.env.HTTPS_PFX_PATH || "",
  httpsPfxPassphrase: process.env.HTTPS_PFX_PASSPHRASE || "",
  bodyLimit: process.env.BODY_LIMIT || "50mb",
  passwordMinLength: Math.max(8, Number(process.env.PASSWORD_MIN_LENGTH || 10)),
  bcryptRounds: Math.min(14, Math.max(10, Number(process.env.BCRYPT_ROUNDS || 12))),
  // Papéis que veem os dados identificáveis sem máscara (LGPD).
  unmaskedRoles: list(process.env.UNMASKED_ROLES, ["admin"]),
  // Chave para cifrar segredos guardados no banco (ex.: senha do servidor de
  // backup). Se vazia, é derivada do JWT_SECRET.
  settingsEncryptionKey: process.env.SETTINGS_ENCRYPTION_KEY || "",
  frontendDistPath: process.env.FRONTEND_DIST_PATH || "",
  initialAdmin: {
    email: process.env.INITIAL_ADMIN_EMAIL || "",
    password: process.env.INITIAL_ADMIN_PASSWORD || "",
    name: process.env.INITIAL_ADMIN_NAME || "Administrador",
  },
  smtp: {
    host: process.env.SMTP_HOST || "",
    port: Number(process.env.SMTP_PORT || 587),
    secure: bool(process.env.SMTP_SECURE),
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
    from: process.env.MAIL_FROM || "DBLAPOGE <no-reply@localhost>",
  },
  logFormat: process.env.LOG_FORMAT || ":remote-addr :method :url :status :response-time ms",
  isTest: process.env.NODE_ENV === "test",
};

const INSECURE_SECRETS = new Set(["change-me", "troque-esta-chave", "secret", "changeme"]);

export function assertSecureConfig() {
  const s = config.jwtSecret;
  if (!s || s.length < 32 || INSECURE_SECRETS.has(s)) {
    throw new Error(
      "JWT_SECRET ausente ou inseguro. Defina JWT_SECRET com pelo menos 32 caracteres aleatórios " +
      "(ex.: `openssl rand -hex 32`) antes de iniciar o servidor. Nunca reutilize valores de exemplo."
    );
  }
  if (!config.databaseUrl) {
    throw new Error("DATABASE_URL não definida.");
  }
}
