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
  `Refusing to run admin adjustment concurrency tests against non-local Supabase URL: ${url}`,
);

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `AdminAdjust-${randomUUID()}-Aa1!`;

async function createUser(prefix) {
  const email = `${prefix}-${suffix}@example.invalid`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
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

const target = await createUser("adjust-target");
const master = await createUser("adjust-master");

let result = await service.from("profiles").update({ admin_role: "admin_master" }).eq("id", master.id);
assert.ifError(result.error);

const masterClient = await signedInClient(master.email);
const requestId = randomUUID();
const args = {
  p_user_id: target.id,
  p_client_request_id: requestId,
  p_balance_delta: 2.5,
  p_points_delta: 15,
  p_reason: "Concurrent retry contract",
};

const responses = await Promise.all(
  Array.from({ length: 20 }, () => rpc(masterClient, "admin_master_adjust_user_v2", args)),
);

assert.equal(new Set(responses.map((row) => row.reference_id)).size, 1, "Retry created multiple references");
assert.equal(new Set(responses.map((row) => JSON.stringify(row))).size, 1, "Retry response changed");

const mismatch = await masterClient.rpc("admin_master_adjust_user_v2", {
  ...args,
  p_balance_delta: 5,
});
assert.ok(mismatch.error, "Reused request ID accepted a different adjustment payload");
assert.match(mismatch.error.message, /parâmetros diferentes/i);

const { data: profile, error: profileError } = await service
  .from("profiles")
  .select("balance,points")
  .eq("id", target.id)
  .single();
assert.ifError(profileError);
assert.equal(Number(profile.balance), 12.5, "Concurrent retries applied credit more than once");
assert.equal(profile.points, 15, "Concurrent retries applied points more than once");

const { count: requestCount, error: requestCountError } = await service
  .from("admin_adjustment_requests")
  .select("client_request_id", { count: "exact", head: true })
  .eq("actor_id", master.id)
  .eq("client_request_id", requestId);
assert.ifError(requestCountError);
assert.equal(requestCount, 1, "Concurrent retries created multiple request rows");

const { count: creditCount, error: creditCountError } = await service
  .from("credit_ledger")
  .select("id", { count: "exact", head: true })
  .eq("user_id", target.id)
  .eq("transaction_type", "ADMIN_ADJUSTMENT")
  .contains("metadata", { client_request_id: requestId });
assert.ifError(creditCountError);
assert.equal(creditCount, 1, "Concurrent retries created multiple credit ledger entries");

const { count: pointsCount, error: pointsCountError } = await service
  .from("points_ledger")
  .select("id", { count: "exact", head: true })
  .eq("user_id", target.id)
  .eq("transaction_type", "ADMIN_ADJUSTMENT")
  .contains("metadata", { client_request_id: requestId });
assert.ifError(pointsCountError);
assert.equal(pointsCount, 1, "Concurrent retries created multiple points ledger entries");

const { count: auditCount, error: auditCountError } = await service
  .from("audit_logs")
  .select("id", { count: "exact", head: true })
  .eq("admin_id", master.id)
  .eq("action", "user.wallet_adjusted")
  .contains("metadata", { client_request_id: requestId });
assert.ifError(auditCountError);
assert.equal(auditCount, 1, "Concurrent retries created multiple audit events");

const directRead = await masterClient.from("admin_adjustment_requests").select("client_request_id").limit(1);
assert.ok(directRead.error, "Admin Master can read internal idempotency rows directly");

console.log("ADMIN_MASTER_ADJUSTMENT_CONCURRENCY_SUITE_PASSED");
