import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("frontend never contains a service role key or client-side result RNG", async () => {
  const [game, scratch, client] = await Promise.all([read("src/components/GameTab.tsx"), read("src/components/ScratchCard.tsx"), read("src/integrations/supabase/client.ts")]);
  assert.doesNotMatch(`${game}\n${scratch}\n${client}`, /service_role|SUPABASE_SERVICE_ROLE|Math\.random\(\)/);
});

test("scratch play, redemption and daily claim are idempotent in database migrations", async () => {
  const [math, store, daily] = await Promise.all([read("supabase/migrations/20260828060000_scratch_math_engine_v1.sql"), read("supabase/migrations/20260828090000_reward_store_ledger.sql"), read("supabase/migrations/20260828070000_mystery_daily_scratch.sql")]);
  assert.match(math, /plays_user_request_unique/);
  assert.match(store, /redemptions_user_request_unique/);
  assert.match(daily, /unique\(user_id, claim_date\)/);
});

test("published math and mystery pools are guarded by database triggers", async () => {
  const source = await read("supabase/migrations/20260828120000_validate_math_and_mystery_versions.sql");
  assert.match(source, /Versão matemática publicada é imutável/);
  assert.match(source, /Não é possível publicar versão sem resultados/);
  assert.match(source, /Pool misterioso possui participante inválido/);
});

test("ledger and audit logs have database-level duplicate and append-only protections", async () => {
  const [store, audit] = await Promise.all([read("supabase/migrations/20260828090000_reward_store_ledger.sql"), read("supabase/migrations/20260828100000_admin_metrics_audit_realtime.sql")]);
  assert.match(store, /unique\(reference_type,reference_id,transaction_type\)/);
  assert.match(audit, /Audit logs são append-only/);
});
