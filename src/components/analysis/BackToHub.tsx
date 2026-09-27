import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

/** Link de volta para o painel da Estatística Avançada. */
export default function BackToHub() {
  return (
    <Link to="/avancada" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary">
      <ArrowLeft className="h-3.5 w-3.5" />Estatística Avançada
    </Link>
  );
}
