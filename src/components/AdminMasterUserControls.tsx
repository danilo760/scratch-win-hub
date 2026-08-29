import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Save, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

type ValidatedAdjustment = {
  balance: number;
  points: number;
  normalizedReason: string;
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  useEffect(() => setRole(user.admin_role), [user.admin_role]);

  const save = async () => {
    if (role === user.admin_role) {
      setConfirmOpen(false);
      return;
    }

    setBusy(true);
    const { error } = await supabase.rpc("admin_set_user_role_v1", {
      p_user_id: user.user_id,
      p_role: role,
    });
    if (error) {
      setBusy(false);
      setConfirmOpen(false);
      setRole(user.admin_role);
      toast.error(error.message);
      return;
    }

    await onChanged();
    setBusy(false);
    setConfirmOpen(false);
    toast.success(`Papel alterado para ${roleLabel(role)}.`);
  };

  const cancelRoleChange = () => {
    if (!busy) setRole(user.admin_role);
  };

  return (
    <>
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
        <Button
          size="sm"
          onClick={() => setConfirmOpen(true)}
          disabled={busy || role === user.admin_role}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Salvar
          papel
        </Button>
      </div>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar alteração de papel?</AlertDialogTitle>
            <AlertDialogDescription>
              Revise esta mudança antes de alterar o nível de acesso administrativo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="rounded-lg border bg-secondary/20 p-3 text-sm">
            <strong className="block">{user.display_name}</strong>
            <span className="text-muted-foreground">{user.email ?? user.user_id}</span>
            <p className="mt-2 font-medium">
              {roleLabel(user.admin_role)} → {roleLabel(role)}
            </p>
            {(role === "admin" || role === "admin_master") && (
              <p className="mt-2 text-xs text-muted-foreground">
                Este papel concede acesso administrativo. Admin Master também acessa configurações
                privilegiadas.
              </p>
            )}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy} onClick={cancelRoleChange}>
              Cancelar
            </AlertDialogCancel>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {" "}
              Confirmar papel
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
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
  const [confirmOpen, setConfirmOpen] = useState(false);
  const requestRef = useRef<{ fingerprint: string; id: string } | null>(null);

  useEffect(() => {
    if (!users.some((user) => user.user_id === userId)) setUserId(users[0]?.user_id ?? "");
  }, [userId, users]);

  const validateAdjustment = (): ValidatedAdjustment | null => {
    const balance = Number(balanceDelta);
    const points = Number(pointsDelta);
    if (!userId || !Number.isFinite(balance) || !Number.isInteger(points)) {
      toast.error("Informe um usuário e valores válidos.");
      return null;
    }
    if (balance === 0 && points === 0) {
      toast.error("Informe pelo menos um ajuste diferente de zero.");
      return null;
    }
    if (!reason.trim()) {
      toast.error("Informe o motivo do ajuste.");
      return null;
    }

    return { balance, points, normalizedReason: reason.trim() };
  };

  const requestConfirmation = () => {
    if (validateAdjustment()) setConfirmOpen(true);
  };

  const apply = async () => {
    const adjustment = validateAdjustment();
    if (!adjustment) return;

    const { balance, points, normalizedReason } = adjustment;
    const fingerprint = JSON.stringify({ userId, balance, points, reason: normalizedReason });
    if (!requestRef.current || requestRef.current.fingerprint !== fingerprint) {
      requestRef.current = { fingerprint, id: crypto.randomUUID() };
    }

    setBusy(true);
    const { error } = await supabase.rpc("admin_master_adjust_user_v2", {
      p_user_id: userId,
      p_client_request_id: requestRef.current.id,
      p_balance_delta: balance,
      p_points_delta: points,
      p_reason: normalizedReason,
    });
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }

    requestRef.current = null;
    setBalanceDelta("0");
    setPointsDelta("0");
    setReason("");
    await onChanged();
    setBusy(false);
    setConfirmOpen(false);
    toast.success("Saldo/pontos ajustados com ledger e auditoria.");
  };

  const selectedUser = users.find((user) => user.user_id === userId) ?? null;
  const balancePreview = Number(balanceDelta);
  const pointsPreview = Number(pointsDelta);

  return (
    <>
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
          <Button
            className="md:col-span-2"
            onClick={requestConfirmation}
            disabled={busy || !users.length}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}{" "}
            Aplicar ajuste auditado
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!busy) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar ajuste administrativo?</AlertDialogTitle>
            <AlertDialogDescription>
              Confira usuário, valores e motivo. A confirmação altera saldo/pontos e registra ledger
              e auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 rounded-lg border bg-secondary/20 p-3 text-sm">
            <div>
              <span className="text-xs text-muted-foreground">Usuário</span>
              <strong className="block">{selectedUser?.display_name ?? userId}</strong>
              <span className="text-xs text-muted-foreground">
                {selectedUser?.email ?? selectedUser?.user_id ?? userId}
              </span>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border bg-background p-2">
                <span className="text-xs text-muted-foreground">Créditos</span>
                <strong className="block">
                  {Number.isFinite(balancePreview) ? formatBRL(balancePreview) : balanceDelta}
                </strong>
                {selectedUser && Number.isFinite(balancePreview) && (
                  <span className="text-xs text-muted-foreground">
                    {formatBRL(selectedUser.balance)} → {formatBRL(selectedUser.balance + balancePreview)}
                  </span>
                )}
              </div>
              <div className="rounded-md border bg-background p-2">
                <span className="text-xs text-muted-foreground">Pontos</span>
                <strong className="block">{Number.isFinite(pointsPreview) ? pointsPreview : pointsDelta}</strong>
                {selectedUser && Number.isFinite(pointsPreview) && (
                  <span className="text-xs text-muted-foreground">
                    {selectedUser.points} → {selectedUser.points + pointsPreview}
                  </span>
                )}
              </div>
            </div>
            <div>
              <span className="text-xs text-muted-foreground">Motivo</span>
              <p className="break-words font-medium">{reason.trim()}</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <Button onClick={() => void apply()} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Wallet className="size-4" />}{" "}
              Confirmar ajuste
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function roleLabel(role: AdminRole): string {
  if (role === "admin_master") return "Admin Master";
  if (role === "admin") return "Admin";
  return "Usuário";
}
