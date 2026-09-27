import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { safeSheetName } from "@/lib/spreadsheet";

describe("safeSheetName", () => {
  it("gera nomes que o Excel aceita", () => {
    const used = new Set<string>();
    const names = ["Matriz D'", "'Resumo'", "a/b:c*?[x]", "x".repeat(40), "Dados", "dados", ""].map((n) => safeSheetName(n, used));
    expect(names[0]).toBe("Matriz D");
    expect(names[1]).toBe("Resumo");
    expect(names[3].length).toBeLessThanOrEqual(31);
    expect(names[5]).toBe("dados (2)");
    const wb = new ExcelJS.Workbook();
    for (const n of names) expect(() => wb.addWorksheet(n)).not.toThrow();
  });
});
