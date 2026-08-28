import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

assert.equal(process.env.PHASE15_ALLOW_LOCAL_TESTS, "true", "PHASE15 local-test guard is required");
assert.ok(url, "Missing local Supabase URL");
assert.ok(anonKey, "Missing local Supabase anon key");
assert.ok(serviceKey, "Missing local Supabase service-role key");
assert.ok(
  url.includes("127.0.0.1") || url.includes("localhost"),
  `Refusing to run phase 15 concurrency tests against non-local Supabase URL: ${url}`,
);

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `P15-${randomUUID()}-Aa1!`;
const emailA = `phase15-a-${suffix}@example.invalid`;
const emailB = `phase15-b-${suffix}@example.invalid`;

async function createUser(email) {
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.ifError(error);
  assert.ok(data.user?.id, `Auth user was not created for ${email}`);
  return data.user.id;
}

async function signedInClient(email) {
  const client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  assert.ifError(error);
  assert.ok(data.session, `No session returned for ${email}`);
  return client;
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data;
}

const userAId = await createUser(emailA);
const userBId = await createUser(emailB);

const { data: profiles, error: profileError } = await service
  .from("profiles")
  .select("id,display_name,public_slug,balance,points")
  .in("id", [userAId, userBId]);
assert.ifError(profileError);
assert.equal(profiles.length, 2);
for (const profile of profiles) {
  assert.ok(profile.display_name);
  assert.ok(profile.public_slug);
  assert.equal(Number(profile.balance), 10);
  assert.equal(profile.points, 0);
}
assert.equal(new Set(profiles.map((profile) => profile.public_slug)).size, 2);

const { data: bronze, error: rarityError } = await service
  .from("scratch_rarities")
  .select("id")
  .eq("slug", "bronze")
  .single();
assert.ifError(rarityError);

const cardId = randomUUID();
const versionId = randomUUID();
const outcomeId = randomUUID();

let result = await service.from("scratchcards").insert({
  id: cardId,
  title: `PHASE15 Concurrent ${suffix}`,
  price: 0.01,
  active: true,
  is_daily_eligible: true,
});
assert.ifError(result.error);

result = await service.from("scratch_math_versions").insert({
  id: versionId,
  scratchcard_id: cardId,
  version_name: `PHASE15 ${suffix}`,
  status: "DRAFT",
  rarity_id: bronze.id,
});
assert.ifError(result.error);

result = await service.from("scratch_outcomes").insert({
  id: outcomeId,
  math_version_id: versionId,
  name: "+1 ponto",
  prize: 0,
  points: 1,
  weight: 1,
});
assert.ifError(result.error);

result = await service
  .from("scratch_math_versions")
  .update({ status: "PUBLISHED" })
  .eq("id", versionId);
assert.ifError(result.error);

const clientA = await signedInClient(emailA);
const clientB = await signedInClient(emailB);

const { data: visibleProfiles, error: visibleProfilesError } = await clientA
  .from("profiles")
  .select("id");
assert.ifError(visibleProfilesError);
assert.deepEqual(
  visibleProfiles.map((row) => row.id),
  [userAId],
);

const forbiddenInsert = await clientA.from("scratchcards").insert({
  title: "should-not-insert",
  price: 0.01,
  active: true,
});
assert.ok(forbiddenInsert.error, "Regular user unexpectedly inserted scratchcards directly");

const forbiddenAdmin = await clientA.rpc("get_admin_operations_v1");
assert.ok(forbiddenAdmin.error, "Regular user unexpectedly called admin RPC successfully");
assert.match(forbiddenAdmin.error.message, /Sem permissão/i);

const paidRequestIds = Array.from({ length: 50 }, () => randomUUID());
const paidResults = await Promise.all(
  paidRequestIds.map((requestId) =>
    rpc(clientA, "play_scratchcard_v1", {
      p_card_id: cardId,
      p_client_request_id: requestId,
      p_source: "phase15-concurrency",
    }),
  ),
);
assert.equal(new Set(paidResults.map((row) => row.id)).size, 50);

const retryRequestId = randomUUID();
const retryResults = await Promise.all(
  Array.from({ length: 20 }, () =>
    rpc(clientA, "play_scratchcard_v1", {
      p_card_id: cardId,
      p_client_request_id: retryRequestId,
      p_source: "phase15-retry",
    }),
  ),
);
assert.equal(new Set(retryResults.map((row) => row.id)).size, 1);
assert.equal(retryResults.filter((row) => row.idempotent === false).length, 1);
assert.equal(retryResults.filter((row) => row.idempotent === true).length, 19);

const dailyResults = await Promise.all(
  Array.from({ length: 20 }, () =>
    rpc(clientA, "claim_daily_scratch_v2", { p_client_request_id: randomUUID() }),
  ),
);
assert.equal(new Set(dailyResults.map((row) => row.id)).size, 1);
assert.equal(dailyResults.filter((row) => row.already_claimed === false).length, 1);
assert.equal(dailyResults.filter((row) => row.already_claimed === true).length, 19);

const { data: finalA, error: finalAError } = await service
  .from("profiles")
  .select("points,balance")
  .eq("id", userAId)
  .single();
assert.ifError(finalAError);
assert.equal(finalA.points, 52);
assert.equal(Number(finalA.balance), 9.49);

const { count: paidPlayCount, error: paidCountError } = await service
  .from("plays")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userAId)
  .neq("source", "daily");
assert.ifError(paidCountError);
assert.equal(paidPlayCount, 51);

const { count: dailyPlayCount, error: dailyCountError } = await service
  .from("plays")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userAId)
  .eq("source", "daily");
assert.ifError(dailyCountError);
assert.equal(dailyPlayCount, 1);

const { count: scratchCostCount, error: scratchCostCountError } = await service
  .from("credit_ledger")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userAId)
  .eq("transaction_type", "SCRATCH_COST");
assert.ifError(scratchCostCountError);
assert.equal(scratchCostCount, 51);

result = await service.from("profiles").update({ points: 100 }).in("id", [userAId, userBId]);
assert.ifError(result.error);

const itemId = randomUUID();
result = await service.from("store_items").insert({
  id: itemId,
  title: `PHASE15 Stock ${suffix}`,
  description: "local concurrency fixture",
  points_cost: 10,
  stock: 1,
  stock_total: 1,
  stock_available: 1,
  per_user_limit: 1,
  active: true,
  display_order: 0,
});
assert.ifError(result.error);

const stockRace = await Promise.allSettled([
  rpc(clientA, "redeem_reward_v1", { p_item_id: itemId, p_client_request_id: randomUUID() }),
  rpc(clientB, "redeem_reward_v1", { p_item_id: itemId, p_client_request_id: randomUUID() }),
]);
assert.equal(stockRace.filter((entry) => entry.status === "fulfilled").length, 1);
assert.equal(stockRace.filter((entry) => entry.status === "rejected").length, 1);
const rejection = stockRace.find((entry) => entry.status === "rejected");
assert.match(rejection.reason.message, /ESGOTADO/i);

const { data: stockRow, error: stockError } = await service
  .from("store_items")
  .select("stock_available")
  .eq("id", itemId)
  .single();
assert.ifError(stockError);
assert.equal(stockRow.stock_available, 0);

const { count: redemptionCount, error: redemptionCountError } = await service
  .from("redemptions")
  .select("id", { count: "exact", head: true })
  .eq("item_id", itemId);
assert.ifError(redemptionCountError);
assert.equal(redemptionCount, 1);

const { data: pointRows, error: pointRowsError } = await service
  .from("profiles")
  .select("id,points")
  .in("id", [userAId, userBId]);
assert.ifError(pointRowsError);
assert.deepEqual(
  pointRows.map((row) => row.points).sort((a, b) => a - b),
  [90, 100],
);

console.log("PHASE15_CONCURRENCY_SUITE_PASSED");
