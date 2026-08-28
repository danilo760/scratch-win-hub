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

let userAId;
let userBId;
let cardId;
let versionId;
let outcomeId;
let itemId;

try {
  userAId = await createUser(emailA);
  userBId = await createUser(emailB);

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

  cardId = randomUUID();
  versionId = randomUUID();
  outcomeId = randomUUID();

  let result = await service.from("scratchcards").insert({
    id: cardId,
    title: `PHASE15 Concurrent ${suffix}`,
    price: 0,
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

  // Real RLS over HTTP: A can only see A, and cannot mutate an admin-owned table directly.
  const { data: visibleProfiles, error: visibleProfilesError } = await clientA
    .from("profiles")
    .select("id");
  assert.ifError(visibleProfilesError);
  assert.deepEqual(visibleProfiles.map((row) => row.id), [userAId]);

  const forbiddenInsert = await clientA.from("scratchcards").insert({
    title: "should-not-insert",
    price: 0,
    active: true,
  });
  assert.ok(forbiddenInsert.error, "Regular user unexpectedly inserted scratchcards directly");

  const forbiddenAdmin = await clientA.rpc("get_admin_operations_v1");
  assert.ok(forbiddenAdmin.error, "Regular user unexpectedly called admin RPC successfully");
  assert.match(forbiddenAdmin.error.message, /Sem permissão/i);

  // 50 truly concurrent paid plays with unique request IDs.
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
  assert.equal(paidResults.length, 50);
  assert.equal(new Set(paidResults.map((row) => row.id)).size, 50);

  // 20 simultaneous retries of the exact same logical request.
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

  // 20 simultaneous daily claims must resolve to one daily play.
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
  assert.equal(finalA.points, 52, "50 plays + 1 idempotent logical play + 1 daily must award 52 points");
  assert.equal(Number(finalA.balance), 10);

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

  // Last-stock race between two authenticated users.
  result = await service.from("profiles").update({ points: 100 }).in("id", [userAId, userBId]);
  assert.ifError(result.error);

  itemId = randomUUID();
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
    rpc(clientA, "redeem_reward_v1", {
      p_item_id: itemId,
      p_client_request_id: randomUUID(),
    }),
    rpc(clientB, "redeem_reward_v1", {
      p_item_id: itemId,
      p_client_request_id: randomUUID(),
    }),
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
} finally {
  // Local-only safety guard above means cleanup is defense in depth, not production protection.
  if (userAId || userBId) {
    const ids = [userAId, userBId].filter(Boolean);
    await service.from("redemptions").delete().in("user_id", ids);
    await service.from("daily_scratch_claims").delete().in("user_id", ids);
    await service.from("mystery_openings").delete().in("user_id", ids);
    await service.from("credit_ledger").delete().in("user_id", ids);
    await service.from("points_ledger").delete().in("user_id", ids);
    await service.from("xp_transactions").delete().in("user_id", ids);
    await service.from("user_achievements").delete().in("user_id", ids);
    await service.from("plays").delete().in("user_id", ids);
  }
  if (itemId) await service.from("store_items").delete().eq("id", itemId);
  if (outcomeId) await service.from("scratch_outcomes").delete().eq("id", outcomeId);
  if (versionId) await service.from("scratch_math_versions").delete().eq("id", versionId);
  if (cardId) await service.from("scratchcards").delete().eq("id", cardId);
  for (const id of [userAId, userBId].filter(Boolean)) {
    await service.auth.admin.deleteUser(id);
    await service.from("profiles").delete().eq("id", id);
  }
}
