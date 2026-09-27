import { useState, useEffect } from "react";
import { parseUploadedFile } from "@/lib/fileParser";
import { UnsupportedSpreadsheetError } from "@/lib/spreadsheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle2, FileSpreadsheet } from "lucide-react";

interface FilePreviewProps {
  file: File;
  maxRows?: number;
  onParsed?: (data: Record<string, unknown>[], columns: string[]) => void;
}

export default function FilePreview({ file, maxRows = 20, onParsed }: FilePreviewProps) {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    parseUploadedFile(file)
      .then((rows) => {
        if (cancelled) return;
        if (rows.length === 0) {
          setError("Nenhum dado encontrado no arquivo. O arquivo parece ter apenas cabeçalhos, sem linhas de registros.");
          setData([]);
          setColumns([]);
          onParsed?.([], []);
        } else {
          const cols = Object.keys(rows[0]);
          setData(rows);
          setColumns(cols);
          onParsed?.(rows, cols);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof UnsupportedSpreadsheetError ? err.message : "Erro ao processar o arquivo.");
        setData([]);
        setColumns([]);
        onParsed?.([], []);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [file]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
        <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Processando arquivo…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        {error}
      </div>
    );
  }

  const preview = data.slice(0, maxRows);
  const visibleCols = columns.slice(0, 15);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="gap-1 text-xs">
          <CheckCircle2 className="h-3 w-3 text-primary" />
          {data.length} registros
        </Badge>
        <Badge variant="outline" className="gap-1 text-xs">
          <FileSpreadsheet className="h-3 w-3" />
          {columns.length} colunas
        </Badge>
        {data.length > maxRows && (
          <span className="text-xs text-muted-foreground">
            (mostrando primeiras {maxRows} linhas)
          </span>
        )}
        {columns.length > 15 && (
          <span className="text-xs text-muted-foreground">
            (mostrando primeiras 15 colunas)
          </span>
        )}
      </div>

      <div className="rounded-lg border bg-card overflow-x-auto max-h-[300px] overflow-y-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs text-muted-foreground w-10">#</TableHead>
              {visibleCols.map((col) => (
                <TableHead key={col} className="whitespace-nowrap text-xs font-mono">
                  {col}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                {visibleCols.map((col) => (
                  <TableCell key={col} className="text-xs whitespace-nowrap max-w-[200px] truncate">
                    {row[col] != null ? String(row[col]) : ""}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
