import { BarChart3, RefreshCw, Settings2, ShieldCheck, Sparkles } from "lucide-react";
import { AdminInsightPanel } from "@/components/AdminInsightPanel";
import { AdminWorkspace } from "@/components/AdminWorkspace";
import { Badge } from "@/components/ui/badge";

const adminSurfaceClass =
  "rounded-2xl border border-border/70 bg-card/40 p-3 shadow-sm sm:p-4 sm:[&_[role=tablist]]:flex-wrap [&_[role=tablist]]:rounded-xl [&_[role=tablist]]:border [&_[role=tablist]]:border-border/70 [&_[role=tablist]]:bg-secondary/50 [&_[role=tab]]:rounded-lg [&_table]:overflow-hidden [&_thead]:bg-secondary/50 [&_th]:font-semibold [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-secondary/30";

const adminHeaderClass =
  "relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-5 shadow-sm sm:p-6";

const adminHeaderGlowClass =
  "pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/5";

const adminIconClass =
  "flex size-10 items-center justify-center rounded-xl border border-primary/20 bg-primary/10 text-primary shadow-sm";

export function AdminPanel() {
  return (
    <section className="space-y-6" aria-labelledby="admin-panel-title">
      <header className={adminHeaderClass}>
        <div className={adminHeaderGlowClass} />
        <div className="pointer-events-none absolute -right-10 -top-12 size-40 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl space-y-2">
            <div className="flex items-center gap-2">
              <div className={adminIconClass}>
                <ShieldCheck className="size-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  Operação segura
                </p>
                <h1
                  id="admin-panel-title"
                  className="text-2xl font-black tracking-tight sm:text-3xl"
                >
                  Painel Administrativo
                </h1>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Acompanhe indicadores, matemática e operação da plataforma sem alterar contratos de
              backend, RLS ou versões publicadas.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1.5 rounded-full px-3 py-1">
              <ShieldCheck className="size-3.5" aria-hidden="true" /> Área restrita
            </Badge>
            <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
              <RefreshCw className="size-3.5" aria-hidden="true" /> Dados em tempo real
            </Badge>
          </div>
        </div>
      </header>

      <section className="space-y-3" aria-labelledby="admin-insights-title">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="size-4 text-primary" aria-hidden="true" />
              <h2 id="admin-insights-title" className="text-lg font-bold tracking-tight">
                Monitoramento e auditoria
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              KPIs operacionais, distribuição real e conferência da matemática publicada.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5">
            <Sparkles className="size-3.5" aria-hidden="true" /> Visão executiva
          </Badge>
        </div>
        <div className={adminSurfaceClass}>
          <AdminInsightPanel />
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="admin-management-title">
        <div className="flex flex-wrap items-end justify-between gap-3 px-1">
          <div>
            <div className="flex items-center gap-2">
              <Settings2 className="size-4 text-primary" aria-hidden="true" />
              <h2 id="admin-management-title" className="text-lg font-bold tracking-tight">
                Gestão da plataforma
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastros, versões, loja, usuários, ledgers, resgates e ferramentas administrativas.
            </p>
          </div>
          <Badge variant="outline">Configuração operacional</Badge>
        </div>
        <div className={adminSurfaceClass}>
          <AdminWorkspace />
        </div>
      </section>
    </section>
  );
}
