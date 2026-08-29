import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatBRL, profileQueryKey, type AdminRole } from "@/hooks/useProfile";

const masterUsersQueryKey = ["admin-master-user-management"] as const;

type MasterUser = {
  user_id: string;
  email: string | null;
  display_name: string;
  balance: number;
  points: number;
  is_admin: boolean;
  admin_role: AdminRole;
  created_at: string;
};

function parseRole(value: unknown): AdminRole {
  return value === "admin_master" || value === "admin" ? value : "user";
}

function parseMasterUsers(value: unknown): MasterUser[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object") return [];
    const raw = entry as Record<string, unknown>;
    const balance = Number(raw.balance);
    const points = Number(raw.points);
    if (
      typeof raw.user_id !== "string" ||
      typeof raw.display_name !== "string" ||
      typeof raw.created_at !== "string" ||
      !Number.isFinite(balance) ||
      !Number.isFinite(points)
    ) {
      return [];
    }
    return [
      {
        user_id: raw.user_id,
        email: typeof raw.email === "string" ? raw.email : null,
        display_name: raw.display_name,
        balance,
        points,
        is_admin: raw.is_admin === true,
        admin_role: parseRole(raw.admin_role),
        created_at: raw.created_at,
      },
    ];
  });
}

export function AdminMasterUserControls() {
  const qc = useQueryClient();
  const usersQuery = useQuery({
    queryKey: masterUsersQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_admin_user_management_v1");
      if (error) throw error;
      return parseMasterUsers(data);
    },
  });

  const refresh = async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: masterUsersQueryKey }),
      qc.invalidateQueries({ queryKey: ["admin-operations"] }),
      qc.invalidateQueries({ queryKey: profileQueryKey }),
    ]);
  };

  if (usersQuery.isLoading) {
    return (
      <Card aria-busy="true">
        <CardContent className="flex min-h-32 items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Carregando controles master…
        </CardContent>
      </Card>
    );
  }

  if (usersQuery.error) {
    return (
      <Card>
        <CardContent className="space-y-3 p-6">
          <p role="alert" className="text-destructive">
            Não foi possível carregar os controles de Admin Master.
          </p>
          <Button variant="outline" onClick={() => void usersQuery.refetch()}>
            <RefreshCw className="size-4" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <div className="space-y-4">
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" /> Controle de Admin Master
          </CardTitle>
          <CardDescription>
            Somente Admin Master pode alterar papéis, matemática, Daily, Mystery, raspadinhas e
            ajustes administrativos de saldo/pontos. Toda alteração financeira abaixo gera ledger e
            auditoria.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {users.length ? (
            users.map((user) => <RoleRow key={user.user_id} user={user} onChanged={refresh} />)
          ) : (
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
          )}
        </CardContent>
      </Card>

      <WalletAdjustment users={users} onChanged={refresh} />
    </div>
  );
}

function RoleRow({ user, onChanged }: { user: MasterUser; onChanged: () => Promise<void> }) {
  const [role, setRole] = useState<AdminRole>(user.admin_role);
  const [busy, setBusy] = useState(false);

  useEffect(() => setRole(user.admin_role), [user.admin_role]);

  const save = async () => {
    if (role === user.admin_role) return;
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_user_role_v1", {
      p_user_id: user.user_id,
      p_role: role,
    });
    setBusy(false);
    if (error) {
      setRole(user.admin_role);
      toast.error(error.message);
      return;
    }
    await onChanged();
    toast.success(`Papel alterado para ${roleLabel(role)}.`);
  };

  return (
    <div className="grid gap-3 rounded-lg border p-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="truncate">{user.display_name}</strong>
          <Badge variant={user.admin_role === "admin_master" ? "default" : "outline"}>
            {roleLabel(user.admin_role)}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {user.email ?? user.user_id} · {formatBRL(user.balance)} · {user.points} pts
        </p>
      </div>
      <select
        aria-label={`Papel de ${user.display_name}`}
        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
        value={role}
        onChange={(event) => setRole(parseRole(event.target.value))}
      >
        <option value="user">Usuário</option>
        <option value="admin">Admin</option>
        <option value="admin_master">Admin Master</option>
      </select>
      <Button size="sm" onClick={save} disabled={busy || role === user.admin_role}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
        papel
      </Button>
    </div>
  );
}

function WalletAdjustment({
  users,
  onChanged,
}: {
  users: MasterUser[];
  onChanged: () => Promise<void>;
}) {
  const [userId, setUserId] = useState(users[0]?.user_id ?? "");
  const [balanceDelta, setBalanceDelta] = useState("0");
  const [pointsDelta, setPointsDelta] = useState("0");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!users.some((user) => user.user_id === userId)) setUserId(users[0]?.user_id ?? "");
  }, [userId, users]);

  const apply = async () => {
    const balance = Number(balanceDelta);
    const points = Number(pointsDelta);
    if (!userId || !Number.isFinite(balance) || !Number.isInteger(points)) {
      toast.error("Informe um usuário e valores válidos.");
      return;
    }
    if (balance === 0 && points === 0) {
      toast.error("Informe pelo menos um ajuste diferente de zero.");
      return;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo do ajuste.");
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("admin_master_adjust_user_v1", {
      p_user_id: userId,
      p_balance_delta: balance,
      p_points_delta: points,
      p_reason: reason.trim(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }

    setBalanceDelta("0");
    setPointsDelta("0");
    setReason("");
    await onChanged();
    toast.success("Saldo/pontos ajustados com ledger e auditoria.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="size-5 text-primary" /> Ajuste administrativo de usuário
        </CardTitle>
        <CardDescription>
          Use valores positivos para adicionar e negativos para remover. O banco impede saldo ou
          pontos negativos e exige um motivo auditável.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="master-user">Usuário</Label>
          <select
            id="master-user"
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
          >
            {users.map((user) => (
              <option key={user.user_id} value={user.user_id}>
                {user.display_name} — {user.email ?? user.user_id}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="master-balance-delta">Créditos: ajuste</Label>
          <Input
            id="master-balance-delta"
            type="number"
            step="0.01"
            value={balanceDelta}
            onChange={(event) => setBalanceDelta(event.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="master-points-delta">Pontos: ajuste</Label>
          <Input
            id="master-points-delta"
            type="number"
            step="1"
            value={pointsDelta}
            onChange={(event) => setPointsDelta(event.target.value)}
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="master-adjust-reason">Motivo obrigatório</Label>
          <Input
            id="master-adjust-reason"
            maxLength={240}
            placeholder="Ex.: correção administrativa documentada"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </div>
        <Button className="md:col-span-2" onClick={apply} disabled={busy || !users.length}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}{" "}
          Aplicar ajuste auditado
        </Button>
      </CardContent>
    </Card>
  );
}

function roleLabel(role: AdminRole): string {
  if (role === "admin_master") return "Admin Master";
  if (role === "admin") return "Admin";
  return "Usuário";
}
