
-- PROFILES
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY,
  email text,
  balance numeric(12,2) NOT NULL DEFAULT 10.00,
  points integer NOT NULL DEFAULT 0,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- SCRATCHCARDS
CREATE TABLE public.scratchcards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  price numeric(12,2) NOT NULL DEFAULT 1.00,
  points_reward integer NOT NULL DEFAULT 10,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scratchcards TO authenticated;
GRANT ALL ON public.scratchcards TO service_role;
ALTER TABLE public.scratchcards ENABLE ROW LEVEL SECURITY;

-- STORE ITEMS
CREATE TABLE public.store_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  points_cost integer NOT NULL DEFAULT 100,
  stock integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_items TO authenticated;
GRANT ALL ON public.store_items TO service_role;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;

-- PLAYS
CREATE TABLE public.plays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  card_id uuid NOT NULL REFERENCES public.scratchcards(id) ON DELETE CASCADE,
  price numeric(12,2) NOT NULL,
  prize numeric(12,2) NOT NULL,
  points_earned integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.plays TO authenticated;
GRANT ALL ON public.plays TO service_role;
ALTER TABLE public.plays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own plays" ON public.plays FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- REDEMPTIONS
CREATE TABLE public.redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  item_id uuid NOT NULL REFERENCES public.store_items(id) ON DELETE CASCADE,
  points_spent integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.redemptions TO authenticated;
GRANT ALL ON public.redemptions TO service_role;
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own redemptions" ON public.redemptions FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- ADMIN HELPER
CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND is_admin = true);
$$;

CREATE POLICY "Anyone authenticated can view active scratchcards" ON public.scratchcards FOR SELECT TO authenticated USING (active = true OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage scratchcards insert" ON public.scratchcards FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage scratchcards update" ON public.scratchcards FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage scratchcards delete" ON public.scratchcards FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "Anyone authenticated can view active store items" ON public.store_items FOR SELECT TO authenticated USING (active = true OR public.is_admin(auth.uid()));
CREATE POLICY "Admins manage store items insert" ON public.store_items FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage store items update" ON public.store_items FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins manage store items delete" ON public.store_items FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- UPDATED_AT
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_scratchcards_updated_at BEFORE UPDATE ON public.scratchcards FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_store_items_updated_at BEFORE UPDATE ON public.store_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- NEW USER TRIGGER (R$10 inicial)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, balance, points)
  VALUES (NEW.id, NEW.email, 10.00, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RPC: play_scratchcard
CREATE OR REPLACE FUNCTION public.play_scratchcard(card_id uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_card public.scratchcards%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
  v_prize numeric(12,2) := 0;
  v_roll numeric;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_card FROM public.scratchcards WHERE id = card_id AND active = true;
  IF NOT FOUND THEN RAISE EXCEPTION 'Raspadinha indisponível'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;
  IF v_profile.balance < v_card.price THEN RAISE EXCEPTION 'Saldo insuficiente'; END IF;

  v_roll := random();
  IF v_roll < 0.03 THEN
    v_prize := round(v_card.price * 10, 2);
  ELSIF v_roll < 0.12 THEN
    v_prize := round(v_card.price * 3, 2);
  ELSIF v_roll < 0.32 THEN
    v_prize := round(v_card.price * 1.5, 2);
  ELSE
    v_prize := 0;
  END IF;

  UPDATE public.profiles
     SET balance = balance - v_card.price + v_prize,
         points = points + v_card.points_reward
   WHERE id = v_user
   RETURNING * INTO v_profile;

  INSERT INTO public.plays (user_id, card_id, price, prize, points_earned)
  VALUES (v_user, v_card.id, v_card.price, v_prize, v_card.points_reward);

  RETURN json_build_object(
    'prize', v_prize,
    'new_balance', v_profile.balance,
    'new_points', v_profile.points,
    'points_earned', v_card.points_reward
  );
END; $$;

REVOKE ALL ON FUNCTION public.play_scratchcard(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.play_scratchcard(uuid) TO authenticated;

-- RPC: redeem_item
CREATE OR REPLACE FUNCTION public.redeem_item(item_id_param uuid)
RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_item public.store_items%ROWTYPE;
  v_profile public.profiles%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT * INTO v_item FROM public.store_items WHERE id = item_id_param AND active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Item indisponível'; END IF;
  IF v_item.stock <= 0 THEN RAISE EXCEPTION 'Item esgotado'; END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_user FOR UPDATE;
  IF v_profile.points < v_item.points_cost THEN RAISE EXCEPTION 'Pontos insuficientes'; END IF;

  UPDATE public.store_items SET stock = stock - 1 WHERE id = v_item.id;
  UPDATE public.profiles SET points = points - v_item.points_cost WHERE id = v_user RETURNING * INTO v_profile;
  INSERT INTO public.redemptions (user_id, item_id, points_spent) VALUES (v_user, v_item.id, v_item.points_cost);

  RETURN json_build_object('success', true, 'new_points', v_profile.points);
END; $$;

REVOKE ALL ON FUNCTION public.redeem_item(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_item(uuid) TO authenticated;

-- SEED
INSERT INTO public.scratchcards (title, price, points_reward, active) VALUES
  ('Sorte Rápida', 1.00, 10, true),
  ('Ouro Dourado', 2.50, 30, true),
  ('Mega Prêmio', 5.00, 75, true);

INSERT INTO public.store_items (title, description, points_cost, stock, active) VALUES
  ('Camiseta Exclusiva', 'Camiseta oficial da plataforma, edição limitada.', 300, 10, true),
  ('Fone Bluetooth', 'Fone sem fio com cancelamento de ruído.', 1200, 5, true),
  ('Bônus R$ 10', 'Crédito bônus adicionado ao seu saldo.', 500, 25, true);
