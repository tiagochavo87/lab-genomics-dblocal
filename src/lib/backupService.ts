import { api } from "@/integrations/api/client";

// As cópias de versão são feitas no servidor: o navegador só pede a operação.
// (Antes os dados passavam pelo navegador, que para não-admin recebe a versão
// mascarada; restaurar assim gravaria a máscara por cima do dado real.)

export async function createVersionBackup(databaseId: string, reason: string = "auto") {
  const { error } = await api.backups.database(databaseId, reason);
  if (error) console.warn("[backup] falha ao criar cópia do banco:", error.message);
  return { error };
}

export async function createSingleVersionBackup(versionId: string, reason: string = "pre_update") {
  const { error } = await api.backups.version(versionId, reason);
  if (error) console.warn("[backup] falha ao criar cópia da versão:", error.message);
  return { error };
}

export async function restoreFromBackup(backupId: string) {
  const { error } = await api.backups.restore(backupId);
  return { error };
}
