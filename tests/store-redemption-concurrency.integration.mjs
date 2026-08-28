import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.API_URL;
const anonKey = process.env.SUPABASE_ANON_KEY || process.env.ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY;

assert.equal(process.env.PHASE15_ALLOW_LOCAL_TESTS, "true", "local-test guard is required");
assert.ok(url, "Missing local Supabase URL");
assert.ok(anonKey, "Missing local Supabase anon key");
assert.ok(serviceKey, "Missing local Supabase service-role key");
assert.ok(
  url.includes("127.0.0.1") || url.includes("localhost"),
  `Refusing to run store redemption concurrency tests against non-local Supabase URL: ${url}`,
);

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `Store-${randomUUID()}-Aa1!`;

async function createUser(prefix) {
  const email = `${prefix}-${suffix}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  assert.ifError(error);
  assert.ok(data.user?.id, `User ${prefix} was not created`);
  return { id: data.user.id, email };
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

const userA = await createUser("store-a");
const userB = await createUser("store-b");
const admin = await createUser("store-admin");

let result = await service.from("profiles").update({ points: 1000 }).in("id", [userA.id, userB.id]);
assert.ifError(result.error);
result = await service.from("profiles").update({ is_admin: true }).eq("id", admin.id);
assert.ifError(result.error);

const clientA = await signedInClient(userA.email);
const clientB = await signedInClient(userB.email);
const adminClient = await signedInClient(admin.email);

const retryItem = randomUUID();
const otherItem = randomUUID();
const limitItem = randomUUID();
const lastItem = randomUUID();
const futureItem = randomUUID();

result = await service.from("store_items").insert([
  {
    id: retryItem,
    title: `Retry Item ${suffix}`,
    description: "retry fixture",
    points_cost: 10,
    stock: 5,
    stock_total: 5,
    stock_available: 5,
    per_user_limit: 5,
    active: true,
    display_order: 0,
  },
  {
    id: otherItem,
    title: `Other Item ${suffix}`,
    description: "request mismatch fixture",
    points_cost: 11,
    stock: 5,
    stock_total: 5,
    stock_available: 5,
    per_user_limit: 5,
    active: true,
    display_order: 1,
  },
  {
    id: limitItem,
    title: `Limit Item ${suffix}`,
    description: "limit fixture",
    points_cost: 5,
    stock: 20,
    stock_total: 20,
    stock_available: 20,
    per_user_limit: 1,
    active: true,
    display_order: 2,
  },
  {
    id: lastItem,
    title: `Last Item ${suffix}`,
    description: "last stock fixture",
    points_cost: 7,
    stock: 1,
    stock_total: 1,
    stock_available: 1,
    per_user_limit: 2,
    active: true,
    display_order: 3,
  },
  {
    id: futureItem,
    title: `Future Item ${suffix}`,
    description: "window fixture",
    points_cost: 1,
    stock: 1,
    stock_total: 1,
    stock_available: 1,
    per_user_limit: 1,
    active: true,
    starts_at: new Date(Date.now() + 86_400_000).toISOString(),
    display_order: 4,
  },
]);
assert.ifError(result.error);

const { data: hiddenFuture, error: hiddenFutureError } = await clientA
  .from("store_items")
  .select("id")
  .eq("id", futureItem);
assert.ifError(hiddenFutureError);
assert.equal(hiddenFuture.length, 0, "Future item leaked through store RLS");

const forbiddenInsert = await clientA.from("store_items").insert({
  title: "forbidden",
  points_cost: 1,
  stock: 1,
  stock_total: 1,
  stock_available: 1,
  per_user_limit: 1,
});
assert.ok(forbiddenInsert.error, "Authenticated user mutated store_items directly");

const retryRequestId = randomUUID();
const retryResults = await Promise.all(
  Array.from({ length: 20 }, () =>
    rpc(clientA, "redeem_reward_v1", {
      p_item_id: retryItem,
      p_client_request_id: retryRequestId,
    }),
  ),
);
assert.equal(new Set(retryResults.map((row) => row.id)).size, 1, "Retry returned multiple redemptions");
assert.equal(retryResults.filter((row) => row.idempotent === false).length, 1);
assert.equal(retryResults.filter((row) => row.idempotent === true).length, 19);
const retryRedemptionId = retryResults[0].id;

const mismatch = await clientA.rpc("redeem_reward_v1", {
  p_item_id: otherItem,
  p_client_request_id: retryRequestId,
});
assert.ok(mismatch.error, "Reused request ID unexpectedly redeemed another item");
assert.match(mismatch.error.message, /client_request_id já utilizado para outro item/i);

const limitRace = await Promise.allSettled(
  Array.from({ length: 20 }, () =>
    rpc(clientA, "redeem_reward_v1", {
      p_item_id: limitItem,
      p_client_request_id: randomUUID(),
    }),
  ),
);
assert.equal(limitRace.filter((entry) => entry.status === "fulfilled").length, 1);
assert.equal(limitRace.filter((entry) => entry.status === "rejected").length, 19);
for (const entry of limitRace.filter((row) => row.status === "rejected")) {
  assert.match(entry.reason.message, /Limite por usuário atingido/i);
}

const lastStockRace = await Promise.allSettled([
  rpc(clientA, "redeem_reward_v1", { p_item_id: lastItem, p_client_request_id: randomUUID() }),
  rpc(clientB, "redeem_reward_v1", { p_item_id: lastItem, p_client_request_id: randomUUID() }),
]);
assert.equal(lastStockRace.filter((entry) => entry.status === "fulfilled").length, 1);
assert.equal(lastStockRace.filter((entry) => entry.status === "rejected").length, 1);
assert.match(lastStockRace.find((entry) => entry.status === "rejected").reason.message, /ESGOTADO/i);
const aWonLastStock = lastStockRace[0].status === "fulfilled";
const bWonLastStock = lastStockRace[1].status === "fulfilled";

const { data: aVisibleRedemptions, error: aVisibleError } = await clientA
  .from("redemptions")
  .select("id,user_id,item_title_snapshot,item_id,status");
assert.ifError(aVisibleError);
assert.ok(aVisibleRedemptions.length >= 2);
assert.ok(aVisibleRedemptions.every((row) => row.user_id === userA.id), "RLS leaked another user's redemption");

const originalTitle = retryResults[0].item_title;
result = await service.from("store_items").update({ title: `Renamed ${suffix}` }).eq("id", retryItem);
assert.ifError(result.error);
const { data: snapshotRow, error: snapshotError } = await clientA
  .from("redemptions")
  .select("item_title_snapshot")
  .eq("id", retryRedemptionId)
  .single();
assert.ifError(snapshotError);
assert.equal(snapshotRow.item_title_snapshot, originalTitle, "Historical item title changed after rename");

const deleteAttempt = await service.from("store_items").delete().eq("id", retryItem);
assert.ok(deleteAttempt.error, "Store item with redemption history was deleted");

const cancelRace = await Promise.all(
  Array.from({ length: 20 }, () =>
    rpc(adminClient, "admin_update_redemption_v1", {
      p_redemption_id: retryRedemptionId,
      p_status: "CANCELADO",
      p_fulfillment_code: null,
    }),
  ),
);
assert.equal(cancelRace.filter((row) => row.idempotent === false).length, 1);
assert.equal(cancelRace.filter((row) => row.idempotent === true).length, 19);

const { count: refundCount, error: refundCountError } = await service
  .from("points_ledger")
  .select("id", { count: "exact", head: true })
  .eq("reference_type", "redemption")
  .eq("reference_id", retryRedemptionId)
  .eq("transaction_type", "REDEMPTION_REFUND");
assert.ifError(refundCountError);
assert.equal(refundCount, 1, "Concurrent cancellation created multiple refunds");

const { data: retryStock, error: retryStockError } = await service
  .from("store_items")
  .select("stock_available,stock_total,stock")
  .eq("id", retryItem)
  .single();
assert.ifError(retryStockError);
assert.deepEqual(
  { available: retryStock.stock_available, total: retryStock.stock_total, alias: retryStock.stock },
  { available: 5, total: 5, alias: 5 },
  "Cancellation did not restore stock exactly once",
);

const { data: profileRows, error: profileRowsError } = await service
  .from("profiles")
  .select("id,points")
  .in("id", [userA.id, userB.id]);
assert.ifError(profileRowsError);
const pointsByUser = new Map(profileRows.map((row) => [row.id, row.points]));
assert.equal(
  pointsByUser.get(userA.id),
  995 - (aWonLastStock ? 7 : 0),
  "User A points do not match retry + limit + last-stock + refund contract",
);
assert.equal(
  pointsByUser.get(userB.id),
  1000 - (bWonLastStock ? 7 : 0),
  "User B points do not match last-stock contract",
);

const { data: limitStock, error: limitStockError } = await service
  .from("store_items")
  .select("stock_available")
  .eq("id", limitItem)
  .single();
assert.ifError(limitStockError);
assert.equal(limitStock.stock_available, 19, "Per-user limit race consumed more than one stock unit");

const { data: lastStock, error: lastStockError } = await service
  .from("store_items")
  .select("stock_available")
  .eq("id", lastItem)
  .single();
assert.ifError(lastStockError);
assert.equal(lastStock.stock_available, 0, "Last-stock race did not consume exactly one unit");

console.log("STORE_REDEMPTION_CONCURRENCY_SUITE_PASSED");
