/**
 * Identificação de colunas identificáveis (LGPD) para AVISOS na interface.
 *
 * O mascaramento em si é feito no SERVIDOR (backend/local-api/src/masking.js):
 * quem não tem permissão já recebe os valores mascarados e nunca vê o dado
 * original, nem pelas ferramentas do navegador. Mantenha as listas abaixo
 * iguais às do servidor.
 */

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

const SUBSTRINGS = [
  "nomecompleto", "nomedopaciente", "nomepaciente", "datanasc", "dtnasc", "datadenascimento",
  "nascimento", "prontuario", "cartaosus", "telefone", "celular", "endereco", "email",
  "paciente", "patient", "identidade", "sobrenome", "nomedamae", "nomemae", "nomedopai",
];

export function isIdentifyingColumn(columnName: string): boolean {
  const norm = columnName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  const tokens = norm.split(/[^a-z0-9]+/).filter(Boolean);
  if (tokens.some((t) => EXACT_TOKENS.has(t))) return true;
  const joined = tokens.join("");
  return SUBSTRINGS.some((s) => joined.includes(s));
}

interface VariableFlag { name: string; identifying?: boolean | null }

/** Colunas identificáveis: marcação explícita da variável prevalece sobre o nome. */
export function getIdentifyingColumns(columns: string[], variables: VariableFlag[] = []): string[] {
  const explicit = new Map<string, boolean>();
  for (const v of variables) if (typeof v.identifying === "boolean") explicit.set(v.name, v.identifying);
  return columns.filter((c) => (explicit.has(c) ? explicit.get(c)! : isIdentifyingColumn(c)));
}
