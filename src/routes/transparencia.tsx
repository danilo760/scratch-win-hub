import { createFileRoute, Link } from "@tanstack/react-router";
import { Eye, ShieldCheck, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/transparencia")({ component: TransparencyPage });

function TransparencyPage() {
  return (
    <main className="min-h-screen bg-background px-4 py-12">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Voltar
        </Link>
        <div>
          <h1 className="text-3xl font-black">Centro de Transparência</h1>
          <p className="mt-2 text-muted-foreground">
            Informações básicas sobre como funcionam as raspadinhas digitais.
          </p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-success" /> Resultado no servidor
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            O resultado é definido e registrado no banco antes da raspagem visual. Raspar a tela não
            muda suas chances nem o resultado.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="size-5 text-accent" /> Versões matemáticas
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Cada campanha usa uma versão matemática com resultados e pesos configurados. Versões
            publicadas são preservadas para histórico e auditoria.
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="size-5 text-primary" /> Registros e segurança
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Jogadas e resgates usam identificadores de requisição para impedir cobranças duplicadas
            em caso de repetição, timeout ou perda de conexão.
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
