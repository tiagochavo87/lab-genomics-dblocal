import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Upload, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { logActivity } from "@/lib/activityLog";
import FilePreview from "@/components/FilePreview";
import { createVersionBackup, createSingleVersionBackup } from "@/lib/backupService";

interface UpdateDatabaseDialogProps {
  databaseId: string;
  diseaseName: string;
  onVersionCreated?: () => void;
}

export default function UpdateDatabaseDialog({ databaseId, diseaseName, onVersionCreated }: UpdateDatabaseDialogProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<Record<string, unknown>[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [nextVersion, setNextVersion] = useState("2");

  useEffect(() => {
    if (open) {
      fetchNextVersion();
    }
  }, [open, databaseId]);

  const fetchNextVersion = async () => {
    const { data } = await api
      .from("database_versions")
      .select("version_number")
      .eq("database_id", databaseId)
      .order("created_at", { ascending: false });

    if (data && data.length > 0) {
      // Find the highest version number and increment
      const maxVersion = Math.max(...data.map(v => {
        const num = parseFloat(v.version_number);
        return isNaN(num) ? 0 : Math.floor(num);
      }));
      setNextVersion(String(maxVersion + 1));
    } else {
      setNextVersion("1");
    }
  };

  const handleUpload = async () => {
    if (!user || previewData.length === 0) return;
    setUploading(true);

    try {
      // Backup existing versions before creating new one
      const { data: existingVersions } = await api
        .from("database_versions")
        .select("id")
        .eq("database_id", databaseId);

      if (existingVersions && existingVersions.length > 0) {
        await createVersionBackup(databaseId, "pre_new_version");
      }

      const versionName = `v${nextVersion} - ${diseaseName}`;

      const { data: newVersion, error } = await api.from("database_versions").insert({
        database_id: databaseId,
        name: versionName,
        version_number: nextVersion,
        row_count: previewData.length,
        data: previewData as any,
        created_by: user.id,
      }).select("*").single();

      if (error) {
        toast.error("Erro ao criar versão: " + error.message);
        return;
      }

      // Auto-create variables if none exist
      const { data: existingVars } = await api
        .from("database_variables")
        .select("id")
        .eq("database_id", databaseId)
        .limit(1);

      if ((!existingVars || existingVars.length === 0) && previewColumns.length > 0) {
        const variableInserts = previewColumns.map((col, i) => ({
          database_id: databaseId,
          name: col,
          variable_type: "text",
          category: "Geral",
          description: "",
          sort_order: i,
        }));
        await api.from("database_variables").insert(variableInserts);
      }

      // Create backup of the new version
      if (newVersion) {
        await createSingleVersionBackup(newVersion.id, "new_version_upload");
      }

      toast.success(`Versão "${versionName}" criada com ${previewData.length} registros!`);
      await logActivity("version_created", "version", newVersion?.id, {
        name: versionName,
        records: previewData.length,
      });

      setSelectedFile(null);
      setPreviewData([]);
      setPreviewColumns([]);
      setOpen(false);
      onVersionCreated?.();
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" /> Atualizar Banco
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Atualizar Banco - Nova Versão</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Versão a ser criada:</span>
            <Badge>v{nextVersion} - {diseaseName}</Badge>
          </div>

          <label
            htmlFor="update-db-file-upload"
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-6 cursor-pointer hover:border-primary/50 transition-colors"
          >
            <Upload className="h-8 w-8 text-muted-foreground mb-2" />
            <p className="text-sm font-medium">
              {selectedFile ? selectedFile.name : "Clique para selecionar arquivo"}
            </p>
            <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv, .txt (tab-separado)</p>
            <input
              id="update-db-file-upload"
              type="file"
              accept=".csv,.xlsx,.xls,.txt"
              className="hidden"
              onChange={e => {
                if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
              }}
            />
          </label>

          {selectedFile && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">{selectedFile.name}</Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-6 px-2"
                  onClick={() => {
                    setSelectedFile(null);
                    setPreviewData([]);
                    setPreviewColumns([]);
                  }}
                >
                  <X className="h-3 w-3" /> Remover
                </Button>
              </div>
              <FilePreview
                file={selectedFile}
                onParsed={(data, cols) => {
                  setPreviewData(data);
                  setPreviewColumns(cols);
                }}
              />
            </div>
          )}

          <Button
            onClick={handleUpload}
            disabled={previewData.length === 0 || uploading}
            className="w-full gap-2"
          >
            {uploading ? (
              <div className="h-4 w-4 rounded-full border-2 border-primary-foreground border-t-transparent animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            {uploading
              ? "Enviando..."
              : `Criar v${nextVersion} (${previewData.length} registros)`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
