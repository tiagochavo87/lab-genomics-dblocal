import { api } from "@/integrations/api/client";
import { downloadXlsx } from "@/lib/spreadsheet";

interface VersionData {
  id: string;
  name: string;
  version_number: string;
  database_id: string;
  row_count: number;
  data: unknown;
}

export async function downloadVersionAsFile(version: VersionData, format: "json" | "xlsx" = "json") {
  const data = Array.isArray(version.data) ? (version.data as Record<string, unknown>[]) : [];
  const filename = `backup_${version.name.replace(/\s/g, "_")}_${version.version_number}`;

  if (format === "xlsx") {
    await downloadXlsx(`${filename}.xlsx`, [{ name: "Dados", rows: data }]);
    return;
  }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Pede ao servidor para enviar a versão aos destinos de backup habilitados. */
export async function sendBackupToDestinations(version: Pick<VersionData, "id">) {
  const { data, error } = await api.backups.sendToDestinations(version.id);
  if (error) return [{ label: "Servidor", success: false, error: error.message }];
  return data || [];
}
