import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const read = (file) => readFile(new URL(`../${file}`, import.meta.url), "utf8");

test("frontend never contains a service role key or client-side result RNG", async () => {
  const [game, scratch, client] = await Promise.all([
    read("src/components/GameTab.tsx"),
    read("src/components/ScratchCard.tsx"),
    read("src/integrations/supabase/client.ts"),
  ]);
  assert.doesNotMatch(
    `${game}\n${scratch}\n${client}`,
    /service_role|SUPABASE_SERVICE_ROLE|Math\.random\(\)/,
  );
});

test("Lovable browser bootstrap has a safe Supabase fallback without server secrets", async () => {
  const [config, client] = await Promise.all([
    read("src/integrations/supabase/public-config.ts"),
    read("src/integrations/supabase/client.ts"),
  ]);

  assert.match(config, /VITE_SUPABASE_URL/);
  assert.match(config, /VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(config, /https:\/\/[a-z0-9]+\.supabase\.co/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /SUPABASE_SERVICE_ROLE|service_role|sb_secret_/);
  assert.doesNotMatch(client, /process\.env\[['"]SUPABASE_(?:URL|PUBLISHABLE_KEY)['"]\]/);
});

test("browser Supabase client leaves publishable-key auth headers to supabase-js", async () => {
  const client = await read("src/integrations/supabase/client.ts");
  assert.match(client, /createClient<Database>\(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(client, /headers\.delete\(["']Authorization["']\)/);
  assert.doesNotMatch(client, /createSupabaseFetch|Bearer \$\{supabaseKey\}/);
});

test("Supabase bearer token attacher is registered globally for server functions", async () => {
  const [start, attacher] = await Promise.all([
    read("src/start.ts"),
    read("src/integrations/supabase/auth-attacher.ts"),
  ]);

  assert.match(start, /import\s*\{\s*attachSupabaseAuth\s*\}/);
  assert.match(start, /functionMiddleware:\s*\[attachSupabaseAuth\]/);
  assert.match(attacher, /Authorization:\s*`Bearer \$\{token\}`/);
});

test("scratch play, redemption and daily claim are idempotent in database migrations", async () => {
  const [math, store, daily] = await Promise.all([
    read("supabase/migrations/20260828053538_scratch_math_engine_v1_retry.sql"),
    read("supabase/migrations/20260828054553_reward_store_ledger.sql"),
    read("supabase/migrations/20260828053758_mystery_daily_scratch.sql"),
  ]);
  assert.match(math, /plays_user_request_unique/);
  assert.match(store, /redemptions_user_request_unique/);
  assert.match(daily, /unique\(user_id, claim_date\)/);
});

test("published math and mystery pools are guarded by database triggers", async () => {
  const source = await read(
    "supabase/migrations/20260828055338_validate_math_and_mystery_versions.sql",
  );
  assert.match(source, /Versão matemática publicada é imutável/);
  assert.match(source, /Não é possível publicar versão sem resultados/);
  assert.match(source, /Pool misterioso possui participante inválido/);
});

test("ledger and audit logs have database-level duplicate and append-only protections", async () => {
  const [store, audit] = await Promise.all([
    read("supabase/migrations/20260828054553_reward_store_ledger.sql"),
    read("supabase/migrations/20260828054853_admin_metrics_audit_realtime.sql"),
  ]);
  assert.match(store, /unique\(reference_type,reference_id,transaction_type\)/);
  assert.match(audit, /Audit logs são append-only/);
});

test("production hardening records scratch movements and rejects invalid redemption transitions", async () => {
  const migration = await read(
    "supabase/migrations/20260828060319_production_ledger_authorization_and_transitions.sql",
  );
  assert.match(migration, /create table if not exists public\.credit_ledger/i);
  assert.match(migration, /'SCRATCH_COST'/);
  assert.match(migration, /'SCRATCH_REWARD'/);
  assert.match(migration, /'DAILY_REWARD'/);
  assert.match(migration, /insert into points_ledger/i);
  assert.match(migration, /Transição de status inválida/);
  assert.match(migration, /grant execute on function public\.is_admin\(uuid\) to authenticated/i);
});