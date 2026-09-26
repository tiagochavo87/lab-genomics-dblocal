// Mascaramento de dados identificáveis (LGPD), aplicado NO SERVIDOR antes
// de a resposta sair. O navegador de um usuário sem permissão nunca recebe
// o valor original.
import { config } from "./config.js";

// Tokens curtos só contam como palavra inteira no nome da coluna
// (evita falsos positivos como "cirurgia" -> "rg" ou "suscetibilidade" -> "sus").
const EXACT_TOKENS = new Set([
  "nome", "name", "nomes", "paciente", "patient", "cpf", "rg", "identidade", "identity",
  "endereco", "address", "rua", "bairro", "cep", "logradouro",
  "telefone", "fone", "tel", "phone", "celular", "whatsapp",
  "email", "mail",
  "nascimento", "nasc", "dn", "dob", "birth", "birthdate", "aniversario",
  "mae", "pai", "mother", "father", "responsavel",
  "sus", "cns", "prontuario", "registro", "matricula",
  "iniciais", "initials", "sobrenome", "surname",
]);

// Trechos longos o suficiente para valer como substring.
const SUBSTRINGS = [
  "nomecompleto", "nomedopaciente", "nomepaciente", "datanasc", "dtnasc", "datadenascimento",
  "nascimento", "prontuario", "cartaosus", "telefone", "celular", "endereco", "email",
  "paciente", "patient", "identidade", "sobrenome", "nomedamae", "nomemae", "nomedopai",
];

function normalize(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

export function isIdentifyingColumnName(columnName) {
  const norm = normalize(columnName);
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => EXACT_TOKENS.has(t))) return true;
  const joined = tokens.join("");
  return SUBSTRINGS.some((s) => joined.includes(s));
}

export function maskValue(value) {
  if (value === null || value === undefined || value === "") return value;
  const str = String(value);
  if (str.length <= 2) return "***";
  return str[0] + "*".repeat(Math.min(str.length - 2, 8)) + str[str.length - 1];
}

export function canSeeUnmasked(user) {
  return Boolean(user) && config.unmaskedRoles.includes(user.app_role);
}

/**
 * Decide as colunas identificáveis de um banco: a marcação explícita da
 * variável (identifying true/false) prevalece; sem marcação, usa o nome.
 */
export function identifyingColumnsFor(columns, variables = []) {
  const explicit = new Map();
  for (const v of variables) {
    if (v && typeof v.identifying === "boolean") explicit.set(v.name, v.identifying);
  }
  return new Set(columns.filter((col) => (explicit.has(col) ? explicit.get(col) : isIdentifyingColumnName(col))));
}

export function maskDataArray(data, variables) {
  if (!Array.isArray(data) || data.length === 0) return data;
  const columns = new Set();
  for (const row of data) {
    if (row && typeof row === "object") for (const key of Object.keys(row)) columns.add(key);
  }
  const idCols = identifyingColumnsFor([...columns], variables);
  if (idCols.size === 0) return data;
  return data.map((row) => {
    if (!row || typeof row !== "object") return row;
    const out = {};
    for (const [key, value] of Object.entries(row)) out[key] = idCols.has(key) ? maskValue(value) : value;
    return out;
  });
}
