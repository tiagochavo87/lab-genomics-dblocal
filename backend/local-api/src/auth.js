import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { query } from "./db.js";
import { config } from "./config.js";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export function isValidEmail(email) {
  return EMAIL_RE.test(email) && email.length <= 254;
}

const COMMON_PASSWORDS = new Set([
  "1234567890", "12345678910", "0123456789", "qwertyuiop", "senha12345", "password12",
  "admin12345", "abcdefghij", "lapoge1234", "dblapoge123", "mudar12345",
]);

/** Devolve uma mensagem de erro ou null se a senha for aceitável. */
export function checkPasswordPolicy(password, email = "") {
  const pwd = String(password || "");
  if (pwd.length < config.passwordMinLength) return `A senha precisa ter pelo menos ${config.passwordMinLength} caracteres`;
  if (pwd.length > 200) return "Senha longa demais";
  if (COMMON_PASSWORDS.has(pwd.toLowerCase())) return "Senha muito comum, escolha outra";
  if (email && pwd.toLowerCase() === normalizeEmail(email)) return "A senha não pode ser igual ao e-mail";
  if (/^(.)\1+$/.test(pwd)) return "A senha não pode ser um único caractere repetido";
  return null;
}

export function signToken(user) {
  return jwt.sign(
    { sub: user.id, tv: user.token_version ?? 0 },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn, algorithm: "HS256" }
  );
}

export async function hashPassword(password) {
  return bcrypt.hash(password, config.bcryptRounds);
}

// Hash de referência para comparar quando o e-mail não existe, deixando o
// tempo de resposta parecido e não revelando quais e-mails estão cadastrados.
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", 10);

export async function comparePassword(password, passwordHash) {
  return bcrypt.compare(String(password || ""), passwordHash || DUMMY_HASH);
}

export async function buildSession(userId) {
  const { rows } = await query(`
    SELECT u.id, u.email, u.token_version, p.full_name
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    WHERE u.id = $1
  `, [userId]);
  const user = rows[0];
  if (!user) return null;
  return {
    access_token: signToken(user),
    user: {
      id: user.id,
      email: user.email,
      user_metadata: { full_name: user.full_name || "" },
    },
  };
}

export async function getAuthUser(req) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    return null;
  }
  const { rows } = await query(`
    SELECT u.id, u.email, u.token_version, p.full_name, p.approved, COALESCE(r.role, 'user') AS app_role
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    LEFT JOIN user_roles r ON r.user_id = u.id
    WHERE u.id = $1
  `, [payload.sub]);
  const user = rows[0];
  if (!user) return null;
  // Token emitido antes da última troca de senha / "sair de todos": inválido.
  if ((payload.tv ?? 0) !== user.token_version) return null;
  return user;
}

/** Invalida todas as sessões abertas do usuário. */
export async function revokeSessions(userId, client = null) {
  const run = client ? client.query.bind(client) : query;
  await run("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [userId]);
}

export function makeResetToken() {
  return crypto.randomBytes(32).toString("hex");
}

export function hashResetToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

const WEAK_ADMIN_PASSWORDS = new Set(["admin123456", "admin", "password", "123456"]);

export async function ensureInitialAdmin() {
  const email = normalizeEmail(config.initialAdmin.email);
  const password = config.initialAdmin.password;
  if (!email || !password) return;

  if (password.length < 10 || WEAK_ADMIN_PASSWORDS.has(password)) {
    console.warn(
      "[AVISO DE SEGURANÇA] INITIAL_ADMIN_PASSWORD é fraca ou é um valor de exemplo. " +
      "Troque a senha do administrador imediatamente após o primeiro login."
    );
  }

  const existing = await query("SELECT id FROM users WHERE lower(email) = $1", [email]);
  let userId = existing.rows[0]?.id;

  if (!userId) {
    const passwordHash = await hashPassword(password);
    const inserted = await query("INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id", [email, passwordHash]);
    userId = inserted.rows[0].id;
    console.log(`[auth] administrador inicial criado: ${email}`);
  }

  await query(`
    INSERT INTO profiles (user_id, full_name, approved, laboratory)
    VALUES ($1, $2, true, 'LAPOGE')
    ON CONFLICT (user_id) DO UPDATE SET approved = true, updated_at = now()
  `, [userId, config.initialAdmin.name]);

  await query(`
    INSERT INTO user_roles (user_id, role)
    VALUES ($1, 'admin')
    ON CONFLICT (user_id) DO UPDATE SET role = 'admin'
  `, [userId]);
}
