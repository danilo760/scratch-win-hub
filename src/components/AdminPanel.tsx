import { RefreshCw, ShieldCheck } from "lucide-react";
import { AdminInsightPanel } from "@/components/AdminInsightPanel";
import { AdminWorkspace } from "@/components/AdminWorkspace";
import { Badge } from "@/components/ui/badge";

/**
 * The authenticated route lazy-loads this composition only for administrators.
 * It deliberately keeps the established Admin components and their RPC contracts
 * intact while providing one consistent administrative entry point.
 */
export function AdminPanel() {
  return (
    <section className="space-y-6" aria-labelledby="admin-panel-title">
      <header className="relative overflow-hidden rounded-xl border border-primary/20 bg-card p-5 shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-primary/10 to-transparent" />
        <div className="relative flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-primary" aria-hidden="true" />
              <h1 id="admin-panel-title" className="text-2xl font-black tracking-tight">
                Painel Administrativo
              </h1>
            </div>
            <p className="text-sm text-muted-foreground">
              Controle operacional e acompanhamento seguro da plataforma.
            </p>
          </div>
          <Badge variant="secondary" className="gap-1.5">
            <RefreshCw className="size-3.5" aria-hidden="true" /> Área restrita
          </Badge>
        </div>
      </header>

      <AdminInsightPanel />
      <AdminWorkspace />
    </section>
  );
}
