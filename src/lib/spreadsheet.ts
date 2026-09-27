/**
 * Leitura e escrita de planilhas.
 *
 * Substitui o pacote "xlsx" 0.18.5 do npm (SheetJS antigo, sem correções de
 * segurança: prototype pollution e ReDoS ao ler arquivos enviados). Usa o
 * ExcelJS, carregado sob demanda para não pesar no carregamento inicial.
 *
 * Formatos suportados na leitura: .xlsx e .csv (e .txt/.tsv em fileParser).
 * O formato binário antigo .xls (Excel 97-2003) não é suportado: o usuário
 * recebe uma mensagem pedindo para salvar como .xlsx.
 */

type Row = Record<string, unknown>;

export interface SheetSpec {
  name: string;
  /** Linhas como objetos (equivalente ao antigo json_to_sheet). */
  rows?: Row[];
  /** Linhas como arrays (equivalente ao antigo aoa_to_sheet). */
  aoa?: unknown[][];
}

export class UnsupportedSpreadsheetError extends Error {}

async function loadExcelJS() {
  const mod = await import("exceljs");
  return (mod as unknown as { default?: typeof import("exceljs") }).default ?? mod;
}

/** Converte o valor de uma célula do ExcelJS em texto, como o usuário vê. */
function cellToText(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const iso = value.toISOString();
    return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.replace("T", " ").slice(0, 19);
  }
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (Array.isArray(v.richText)) return v.richText.map((part: { text?: string }) => part.text ?? "").join("");
    if ("result" in v) return cellToText(v.result);
    if ("text" in v) return cellToText(v.text);
    if ("error" in v) return "";
    return "";
  }
  return String(value);
}

/**
 * Lê um arquivo .xlsx e devolve uma grade de textos por planilha.
 * CSV é tratado pelo parser de texto em fileParser.ts.
 */
export async function readXlsxGrids(file: File): Promise<string[][][]> {
  const ext = file.name.split(".").pop()?.toLowerCase();
  if (ext === "xls") {
    throw new UnsupportedSpreadsheetError(
      "Arquivos .xls (Excel 97-2003) não são suportados. Abra no Excel ou LibreOffice e salve como .xlsx ou .csv."
    );
  }

  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());

  const grids: string[][][] = [];
  workbook.eachSheet((sheet) => {
    const grid: string[][] = [];
    const width = sheet.columnCount;
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      for (let col = 1; col <= width; col++) cells.push(cellToText(row.getCell(col).value).trim());
      grid.push(cells);
    });
    grids.push(grid);
  });
  return grids;
}

function rowsToAoa(rows: Row[]): unknown[][] {
  const headers: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }
  return [headers, ...rows.map((row) => headers.map((h) => row[h] ?? ""))];
}

function normalizeCell(value: unknown): string | number | boolean | Date | null {
  if (value == null) return null;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "string" || value instanceof Date) return value;
  return JSON.stringify(value);
}

/**
 * Nome de aba aceito pelo Excel: até 31 caracteres, sem : \\ / ? * [ ],
 * sem apóstrofo no início/fim (ex.: "Matriz D'" quebrava a exportação do LD)
 * e sem repetir nomes.
 */
export function safeSheetName(name: string, used: Set<string> = new Set()): string {
  let base = String(name || "").replace(/[:\\/?*[\]]/g, "-").replace(/^'+|'+$/g, "").trim().slice(0, 31) || "Planilha";
  base = base.replace(/'+$/g, "").trim() || "Planilha";
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

/** Gera e baixa um .xlsx com uma ou mais planilhas. */
export async function downloadXlsx(filename: string, sheets: SheetSpec[]): Promise<void> {
  const ExcelJS = await loadExcelJS();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "DBLAPOGE";
  workbook.created = new Date();

  const used = new Set<string>();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(safeSheetName(spec.name, used));
    const aoa = spec.aoa ?? rowsToAoa(spec.rows ?? []);
    for (const line of aoa) sheet.addRow(line.map(normalizeCell));
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  // Sem acentos e caracteres proibidos no Windows: alguns navegadores/sistemas
  // descartam o nome e salvam como "download" sem extensão.
  const clean = filename
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[<>:"/\\|?*]/g, "-")
    .trim() || "dados";
  a.download = clean.endsWith(".xlsx") ? clean : `${clean}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
