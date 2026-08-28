import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, PlusCircle, Ticket, Gift } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function AdminTab() {
  const qc = useQueryClient();
  const [cardForm, setCardForm] = useState({ title: "", price: "1.00", points_reward: "10" });
  const [itemForm, setItemForm] = useState({
    title: "",
    description: "",
    points_cost: "100",
    stock: "10",
  });
  const [savingCard, setSavingCard] = useState(false);
  const [savingItem, setSavingItem] = useState(false);

  const createCard = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingCard(true);
    const { error } = await supabase.from("scratchcards").insert({
      title: cardForm.title,
      price: Number(cardForm.price),
      points_reward: Number(cardForm.points_reward),
      active: true,
    });
    setSavingCard(false);
    if (error) return toast.error(error.message);
    toast.success("Raspadinha criada com sucesso!");
    setCardForm({ title: "", price: "1.00", points_reward: "10" });
    qc.invalidateQueries({ queryKey: ["scratchcards"] });
  };

  const createItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingItem(true);
    const { error } = await supabase.from("store_items").insert({
      title: itemForm.title,
      description: itemForm.description,
      points_cost: Number(itemForm.points_cost),
      stock: Number(itemForm.stock),
      active: true,
    });
    setSavingItem(false);
    if (error) return toast.error(error.message);
    toast.success("Item criado com sucesso!");
    setItemForm({ title: "", description: "", points_cost: "100", stock: "10" });
    qc.invalidateQueries({ queryKey: ["store_items"] });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="size-5 text-accent" /> Nova Raspadinha
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createCard} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="card-title">Título</Label>
              <Input
                id="card-title"
                required
                value={cardForm.title}
                onChange={(e) => setCardForm({ ...cardForm, title: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="card-price">Preço (R$)</Label>
                <Input
                  id="card-price"
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={cardForm.price}
                  onChange={(e) => setCardForm({ ...cardForm, price: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="card-points">Pontos</Label>
                <Input
                  id="card-points"
                  type="number"
                  min="0"
                  required
                  value={cardForm.points_reward}
                  onChange={(e) => setCardForm({ ...cardForm, points_reward: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" variant="glow" className="w-full" disabled={savingCard}>
              {savingCard ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
              Criar Raspadinha
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gift className="size-5 text-accent" /> Novo Item na Loja
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={createItem} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="item-title">Título</Label>
              <Input
                id="item-title"
                required
                value={itemForm.title}
                onChange={(e) => setItemForm({ ...itemForm, title: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="item-desc">Descrição</Label>
              <Textarea
                id="item-desc"
                value={itemForm.description}
                onChange={(e) => setItemForm({ ...itemForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="item-cost">Custo (pts)</Label>
                <Input
                  id="item-cost"
                  type="number"
                  min="0"
                  required
                  value={itemForm.points_cost}
                  onChange={(e) => setItemForm({ ...itemForm, points_cost: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="item-stock">Estoque</Label>
                <Input
                  id="item-stock"
                  type="number"
                  min="0"
                  required
                  value={itemForm.stock}
                  onChange={(e) => setItemForm({ ...itemForm, stock: e.target.value })}
                />
              </div>
            </div>
            <Button type="submit" variant="glow" className="w-full" disabled={savingItem}>
              {savingItem ? <Loader2 className="size-4 animate-spin" /> : <PlusCircle className="size-4" />}
              Criar Item
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
