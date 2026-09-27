/**
 * Lê um arquivo de texto (CSV/TXT/TSV) detectando a codificação.
 *
 * Planilhas salvas como CSV no Excel em português costumam usar Windows-1252
 * (ANSI), e não UTF-8: lidas como UTF-8, palavras como "Não" viravam "N�o".
 * Ordem: BOM UTF-16 → UTF-8 válido → Windows-1252.
 */
export async function readTextFile(file: Blob): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
