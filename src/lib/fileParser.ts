import { readXlsxGrids } from "./spreadsheet";
import { readTextFile } from "./textEncoding";

/**
 * Parse uploaded file (XLS, XLSX, CSV, TXT) into array of objects.
 * Detects header rows dynamically and handles locale numbers.
 */
export async function parseUploadedFile(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "txt" || ext === "tsv" || ext === "csv") {
    const text = await readTextFile(file);
    // CSV passa pela mesma detecção de cabeçalho usada nas planilhas.
    const lines = text
      .replace(/^\uFEFF/, "")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"));
    if (lines.length < 2) return [];
    const separator = detectSeparator(lines[0]);
    return parseGrid(lines.map((line) => splitDelimitedLine(line, separator)));
  }

  // XLSX: lê todas as planilhas e escolhe a que tem mais linhas válidas
  const grids = await readXlsxGrids(file);
  let bestRows: Record<string, unknown>[] = [];
  for (const grid of grids) {
    const rows = parseGrid(grid);
    if (rows.length > bestRows.length) bestRows = rows;
  }

  return bestRows;
}

export function parseGrid(grid: unknown[][]): Record<string, unknown>[] {
  const rows = grid
    .map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "").trim()) : []))
    .filter((row) => row.some((cell) => cell !== ""));

  if (rows.length < 2) return [];

  const headerIndex = detectHeaderRow(rows);
  if (headerIndex === -1) return [];

  const headers = makeUniqueHeaders(rows[headerIndex]);
  const dataRows = rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell !== ""));

  return dataRows.map((row) => {
    const record: Record<string, unknown> = {};

    headers.forEach((header, colIndex) => {
      record[header] = parseCellValue(row[colIndex] ?? "");
    });

    return record;
  });
}

function detectHeaderRow(rows: string[][]): number {
  const maxRowsToScan = Math.min(rows.length, 20);
  let bestIndex = -1;
  let bestScore = -1;

  for (let i = 0; i < maxRowsToScan; i++) {
    const current = rows[i];
    const nonEmpty = current.filter((c) => c !== "").length;
    if (nonEmpty < 2) continue;

    const textLike = current.filter((c) => /[A-Za-zÀ-ÿ_]/.test(c)).length;
    const hasDataBelow = rows.slice(i + 1, i + 6).some((r) => r.some((c) => c !== ""));
    const score = nonEmpty * 2 + textLike + (hasDataBelow ? 3 : 0);

    if (score > bestScore) {
      bestScore = score;
      bestIndex = i;
    }
  }

  return bestIndex;
}

function makeUniqueHeaders(rawHeaders: string[]): string[] {
  const seen = new Map<string, number>();

  return rawHeaders.map((header, index) => {
    let base = normalizeHeaderLabel(header) || `coluna_${index + 1}`;
    // Evita chaves especiais de objeto vindas de arquivos enviados.
    if (["__proto__", "constructor", "prototype"].includes(base)) base = `${base}_col`;
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    return count === 0 ? base : `${base}_${count + 1}`;
  });
}

function normalizeHeaderLabel(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCellValue(value: string): string | number {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const lower = trimmed.toLowerCase();
  // Textos como "Sim"/"Não"/"true" são mantidos como estão (antes viravam
  // verdadeiro/falso e apareciam como "true" na tabela). Só números são
  // convertidos, inclusive no formato brasileiro (1.234,56).
  const numeric = parseNumericValue(trimmed);
  if (numeric !== null) return numeric;

  return trimmed;
}

function parseNumericValue(input: string): number | null {
  const normalized = input.replace(/\s/g, "");

  // 1.234,56
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(normalized)) {
    const n = Number(normalized.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // 1,234.56
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(normalized)) {
    const n = Number(normalized.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  // 1234,56
  if (/^-?\d+(,\d+)$/.test(normalized)) {
    const n = Number(normalized.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // 1234.56 or 1234
  if (/^-?\d+(\.\d+)?$/.test(normalized)) {
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function detectSeparator(headerLine: string): string {
  if (headerLine.includes("\t")) return "\t";
  if (headerLine.includes(";")) return ";";
  return ",";
}

function splitDelimitedLine(line: string, separator: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === separator && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

