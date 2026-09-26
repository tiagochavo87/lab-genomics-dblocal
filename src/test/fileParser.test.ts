import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseUploadedFile } from "@/lib/fileParser";
import { UnsupportedSpreadsheetError } from "@/lib/spreadsheet";

describe("parseUploadedFile", () => {
  it("lê CSV com ; e números no formato brasileiro", async () => {
    const file = new File(["id;valor;ok;obito\n1;1.234,56;sim;0\n2;7,5;não;1\n"], "dados.csv");
    const rows = await parseUploadedFile(file);
    expect(rows).toEqual([
      { id: 1, valor: 1234.56, ok: true, obito: 0 },
      { id: 2, valor: 7.5, ok: false, obito: 1 },
    ]);
  });

  it("lê XLSX e ignora linhas de título acima do cabeçalho", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Dados");
    ws.addRow(["Planilha do projeto"]);
    ws.addRow([]);
    ws.addRow(["amostra", "genotipo", "idade", "coleta"]);
    ws.addRow(["A1", "AG", 45, new Date(Date.UTC(2020, 4, 12))]);
    ws.addRow(["A2", "GG", 51, new Date(Date.UTC(2021, 0, 3))]);
    const buffer = await wb.xlsx.writeBuffer();
    const rows = await parseUploadedFile(new File([buffer], "dados.xlsx"));
    expect(rows).toEqual([
      { amostra: "A1", genotipo: "AG", idade: 45, coleta: "2020-05-12" },
      { amostra: "A2", genotipo: "GG", idade: 51, coleta: "2021-01-03" },
    ]);
  });

  it("recusa .xls antigo com mensagem clara", async () => {
    await expect(parseUploadedFile(new File(["x"], "velho.xls"))).rejects.toBeInstanceOf(UnsupportedSpreadsheetError);
  });

  it("neutraliza cabeçalhos perigosos", async () => {
    const rows = await parseUploadedFile(new File(["__proto__,b\nx,y\n"], "p.csv"));
    expect(Object.keys(rows[0])).toEqual(["__proto___col", "b"]);
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
