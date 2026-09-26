import { describe, it, expect } from "vitest";
import { getIdentifyingColumns, isIdentifyingColumn } from "@/lib/dataMasking";

describe("isIdentifyingColumn", () => {
  it("detecta colunas identificáveis comuns", () => {
    for (const c of ["Nome", "nome_paciente", "CPF", "DataNascimento", "data_nasc", "Telefone", "e-mail", "Nome da Mãe", "Cartão SUS", "prontuario"]) {
      expect(isIdentifyingColumn(c), c).toBe(true);
    }
  });
  it("não gera falsos positivos por substring curta", () => {
    for (const c of ["cirurgia", "suscetibilidade", "país", "genotipo_rs123", "idade", "sexo", "carga_viral"]) {
      expect(isIdentifyingColumn(c), c).toBe(false);
    }
  });
  it("marcação explícita da variável prevalece", () => {
    const cols = ["registro_amostra", "genotipo"];
    expect(getIdentifyingColumns(cols, [{ name: "registro_amostra", identifying: false }, { name: "genotipo", identifying: true }])).toEqual(["genotipo"]);
  });
});
