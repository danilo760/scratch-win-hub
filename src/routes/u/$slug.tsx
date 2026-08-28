import { createFileRoute, Link } from "@tanstack/react-router";
import { CalendarDays, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

type PublicProfile = {
  slug: string;
  display_name: string;
  avatar_url: string | null;
  level: number;
  xp: number;
  joined_at: string;
  achievements: Array<{ name: string; description: string; icon: string; earned_at: string }>;
  stats: { scratch_count?: number; rarities?: string[] };
  show_achievements: boolean;
  show_statistics: boolean;
};

export const Route = createFileRoute("/u/$slug")({
  loader: async ({ params }) => {
    const { data, error } = await supabase.rpc(
      "get_public_profile" as never,
      {
        p_slug: params.slug,
      } as never,
    );
    if (error) throw error;
    return data as unknown as PublicProfile | null;
  },
  component: PublicProfilePage,
});

function PublicProfilePage() {
  const profile = Route.useLoaderData();
  if (!profile) {
    return (
      <main className="grid min-h-screen place-items-center p-4 text-center text-muted-foreground">
        Perfil não encontrado ou privado.
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-5">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Voltar
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 pt-8 text-center sm:flex-row sm:text-left">
            <Avatar className="size-20 border-2 border-primary">
              <AvatarImage src={profile.avatar_url ?? undefined} />
              <AvatarFallback>{profile.display_name.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div>
              <h1 className="text-2xl font-black">{profile.display_name}</h1>
              <p className="text-sm text-muted-foreground">@{profile.slug}</p>
              <div className="mt-2 flex items-center justify-center gap-3 text-sm sm:justify-start">
                <span className="font-bold text-primary">Nível {profile.level}</span>
                <span>{profile.xp} XP</span>
              </div>
            </div>
          </CardContent>
        </Card>
        {profile.show_statistics && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="size-5 text-accent" /> Estatísticas
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-lg bg-secondary p-3">
                <strong className="block text-xl">{profile.stats.scratch_count ?? 0}</strong>
                <span className="text-xs text-muted-foreground">Raspadinhas</span>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <strong className="block text-xl">{profile.stats.rarities?.length ?? 0}</strong>
                <span className="text-xs text-muted-foreground">Raridades</span>
              </div>
            </CardContent>
          </Card>
        )}
        {profile.show_achievements && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Trophy className="size-5 text-accent" /> Conquistas
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {profile.achievements.length ? (
                profile.achievements.map((achievement) => (
                  <div
                    key={`${achievement.name}-${achievement.earned_at}`}
                    className="flex gap-3 rounded-lg bg-secondary p-3"
                  >
                    <span className="text-2xl">{achievement.icon}</span>
                    <div>
                      <strong>{achievement.name}</strong>
                      <p className="text-sm text-muted-foreground">{achievement.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">Nenhuma conquista pública ainda.</p>
              )}
            </CardContent>
          </Card>
        )}
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3" /> Membro desde{" "}
          {new Date(profile.joined_at).toLocaleDateString("pt-BR")}
        </p>
      </div>
    </main>
  );
}
