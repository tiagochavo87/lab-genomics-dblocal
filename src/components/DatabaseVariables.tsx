import { useState, useEffect } from "react";
import { api } from "@/integrations/api/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, GripVertical } from "lucide-react";
import { toast } from "sonner";
import { useRole } from "@/hooks/useAdminCheck";
import { isIdentifyingColumn } from "@/lib/dataMasking";

interface Variable {
  id: string;
  database_id: string;
  name: string;
  variable_type: string;
  category: string;
  description: string;
  sort_order: number;
  identifying?: boolean | null;
}

const LGPD_OPTIONS = [
  { value: "auto", label: "Automático" },
  { value: "yes", label: "Identificável" },
  { value: "no", label: "Não identificável" },
];

const VARIABLE_TYPES = [
  { value: "text", label: "Texto" },
  { value: "number", label: "Numérico" },
  { value: "integer", label: "Inteiro" },
  { value: "boolean", label: "Sim/Não" },
  { value: "date", label: "Data" },
  { value: "genotype", label: "Genótipo (ex: AA, AG, GG)" },
  { value: "category", label: "Categórico" },
];

const DEFAULT_CATEGORIES = [
  "Demografia", "Genética e Imunologia", "Desfechos", "Sintomas",
  "Comorbidades", "Exames Hematológicos", "Exames Bioquímicos",
  "Gasometria", "Biomarcadores", "Geral"
];

export default function DatabaseVariables({ databaseId }: { databaseId: string }) {
  const [variables, setVariables] = useState<Variable[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [varType, setVarType] = useState("text");
  const [category, setCategory] = useState("Geral");
  const [customCategory, setCustomCategory] = useState("");
  const [description, setDescription] = useState("");
  const { isAdmin } = useRole();

  // Define se a coluna é mascarada para quem não é admin (LGPD).
  const setIdentifying = async (v: Variable, value: string) => {
    const identifying = value === "auto" ? null : value === "yes";
    const { error } = await api.from("database_variables").update({ identifying }).eq("id", v.id);
    if (error) return toast.error(error.message);
    setVariables((prev) => prev.map((x) => (x.id === v.id ? { ...x, identifying } : x)));
    toast.success("Classificação LGPD atualizada");
  };

  const fetchVariables = async () => {
    const { data, error } = await api
      .from("database_variables")
      .select("*")
      .eq("database_id", databaseId)
      .order("sort_order", { ascending: true });
    if (!error) setVariables(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchVariables(); }, [databaseId]);

  const handleAdd = async () => {
    if (!name.trim()) return;
    const finalCategory = category === "__custom" ? customCategory.trim() : category;
    const { error } = await api.from("database_variables").insert({
      database_id: databaseId,
      name: name.trim(),
      variable_type: varType,
      category: finalCategory || "Geral",
      description: description.trim(),
      sort_order: variables.length,
    });
    if (error) {
      toast.error("Erro ao adicionar variável");
    } else {
      toast.success("Variável adicionada!");
      setName(""); setVarType("text"); setCategory("Geral"); setDescription(""); setCustomCategory("");
      setAddOpen(false);
      fetchVariables();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await api.from("database_variables").delete().eq("id", id);
    if (error) toast.error("Erro ao excluir");
    else { toast.success("Variável excluída"); fetchVariables(); }
  };

  const groupedVars = variables.reduce<Record<string, Variable[]>>((acc, v) => {
    (acc[v.category] = acc[v.category] || []).push(v);
    return acc;
  }, {});

  const typeLabel = (t: string) => VARIABLE_TYPES.find(vt => vt.value === t)?.label || t;

  const typeBadgeColor = (t: string) => {
    const map: Record<string, string> = {
      number: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
      integer: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300",
      text: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
      boolean: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
      genotype: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
      date: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
      category: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300",
    };
    return map[t] || map.text;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold font-display">Variáveis</h3>
          <p className="text-sm text-muted-foreground">{variables.length} variáveis definidas</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" /> Adicionar Variável</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova Variável</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 pt-2">
              <Input placeholder="Nome da variável (ex: IL6, Idade, Genótipo_rs123)" value={name} onChange={e => setName(e.target.value)} />
              <Select value={varType} onValueChange={setVarType}>
                <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  {VARIABLE_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {DEFAULT_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  <SelectItem value="__custom">+ Nova Categoria</SelectItem>
                </SelectContent>
              </Select>
              {category === "__custom" && (
                <Input placeholder="Nome da nova categoria" value={customCategory} onChange={e => setCustomCategory(e.target.value)} />
              )}
              <Input placeholder="Descrição (opcional)" value={description} onChange={e => setDescription(e.target.value)} />
              <Button onClick={handleAdd} disabled={!name.trim()} className="w-full">Adicionar</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <div className="flex justify-center py-8">
          <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : variables.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center py-8 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma variável definida. Adicione variáveis para estruturar seus dados.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(groupedVars).map(([cat, vars]) => (
            <Card key={cat}>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm font-display">{cat} <Badge variant="outline" className="ml-2 text-xs">{vars.length}</Badge></CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Nome</TableHead>
                      <TableHead className="text-xs">Tipo</TableHead>
                      <TableHead className="text-xs">Descrição</TableHead>
                      <TableHead className="text-xs">LGPD</TableHead>
                      <TableHead className="text-xs w-[60px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vars.map(v => (
                      <TableRow key={v.id}>
                        <TableCell className="font-mono text-sm font-medium">{v.name}</TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColor(v.variable_type)}`}>
                            {typeLabel(v.variable_type)}
                          </span>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{v.description || "—"}</TableCell>
                        <TableCell className="text-xs">
                          {isAdmin ? (
                            <Select
                              value={v.identifying == null ? "auto" : v.identifying ? "yes" : "no"}
                              onValueChange={(val) => setIdentifying(v, val)}
                            >
                              <SelectTrigger className="h-7 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {LGPD_OPTIONS.map((o) => (
                                  <SelectItem key={o.value} value={o.value} className="text-xs">
                                    {o.value === "auto" ? `Automático (${isIdentifyingColumn(v.name) ? "mascara" : "não mascara"})` : o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            (v.identifying ?? isIdentifyingColumn(v.name)) ? <Badge variant="outline" className="text-[10px]">Mascarada</Badge> : "—"
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleDelete(v.id)}>
                            <Trash2 className="h-3.5 w-3.5 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
