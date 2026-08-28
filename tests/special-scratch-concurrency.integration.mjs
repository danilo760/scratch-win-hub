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
  `Refusing to run special scratch concurrency tests against non-local Supabase URL: ${url}`,
);

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `Special-${randomUUID()}-Aa1!`;
const email = `special-concurrency-${suffix}@example.invalid`;

const { data: created, error: createError } = await service.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
assert.ifError(createError);
assert.ok(created.user?.id, "Special concurrency user was not created");
const userId = created.user.id;

const client = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data: sessionData, error: signInError } = await client.auth.signInWithPassword({
  email,
  password,
});
assert.ifError(signInError);
assert.ok(sessionData.session, "Special concurrency user did not receive a session");

const { data: rarities, error: rarityError } = await service
  .from("scratch_rarities")
  .select("id,slug")
  .in("slug", ["bronze", "prata"]);
assert.ifError(rarityError);
const bronze = rarities.find((row) => row.slug === "bronze");
const prata = rarities.find((row) => row.slug === "prata");
assert.ok(bronze?.id && prata?.id, "Required rarities are missing");

const cardA = randomUUID();
const cardB = randomUUID();
const versionA = randomUUID();
const versionB = randomUUID();

let result = await service.from("scratchcards").insert([
  { id: cardA, title: `Mystery A ${suffix}`, price: 1, active: true },
  { id: cardB, title: `Mystery B ${suffix}`, price: 1, active: true },
]);
assert.ifError(result.error);

result = await service.from("scratch_math_versions").insert([
  {
    id: versionA,
    scratchcard_id: cardA,
    version_name: `Mystery A ${suffix}`,
    status: "DRAFT",
    rarity_id: bronze.id,
  },
  {
    id: versionB,
    scratchcard_id: cardB,
    version_name: `Mystery B ${suffix}`,
    status: "DRAFT",
    rarity_id: prata.id,
  },
]);
assert.ifError(result.error);

result = await service.from("scratch_outcomes").insert([
  {
    math_version_id: versionA,
    name: "A",
    prize: 0,
    points: 1,
    weight: 1,
  },
  {
    math_version_id: versionB,
    name: "B",
    prize: 0,
    points: 1,
    weight: 1,
  },
]);
assert.ifError(result.error);

result = await service
  .from("scratch_math_versions")
  .update({ status: "PUBLISHED" })
  .in("id", [versionA, versionB]);
assert.ifError(result.error);

const mysteryId = randomUUID();
result = await service.from("mystery_versions").insert({
  id: mysteryId,
  name: `Mystery Pool ${suffix}`,
  status: "DRAFT",
});
assert.ifError(result.error);

result = await service.from("mystery_version_entries").insert([
  { mystery_version_id: mysteryId, scratchcard_id: cardA, weight: 0.5 },
  { mystery_version_id: mysteryId, scratchcard_id: cardB, weight: 0.5 },
]);
assert.ifError(result.error);

result = await service.from("mystery_versions").update({ status: "PUBLISHED" }).eq("id", mysteryId);
assert.ifError(result.error);

const forbiddenDirectMutation = await client.from("mystery_versions").insert({
  name: "forbidden",
  status: "DRAFT",
});
assert.ok(forbiddenDirectMutation.error, "Authenticated user inserted a mystery version directly");

async function open(requestId) {
  const { data, error } = await client.rpc("open_mystery_scratch_v1", {
    p_client_request_id: requestId,
  });
  if (error) throw new Error(`open_mystery_scratch_v1: ${error.message}`);
  return data;
}

const retryId = randomUUID();
const retryResults = await Promise.all(Array.from({ length: 20 }, () => open(retryId)));
assert.equal(new Set(retryResults.map((row) => row.id)).size, 1);
assert.equal(retryResults.filter((row) => row.idempotent === false).length, 1);
assert.equal(retryResults.filter((row) => row.idempotent === true).length, 19);

const weightedResults = [];
for (let i = 0; i < 60; i += 1) {
  weightedResults.push(await open(randomUUID()));
}
assert.deepEqual(
  [...new Set(weightedResults.map((row) => row.scratchcard_id))].sort(),
  [cardA, cardB].sort(),
  "Fractional 0.5/0.5 mystery entries were not both reachable",
);

const { count: openingCount, error: openingCountError } = await service
  .from("mystery_openings")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId)
  .eq("mystery_version_id", mysteryId);
assert.ifError(openingCountError);
assert.equal(openingCount, 61, "Retry created duplicate mystery openings");

const { count: playCount, error: playCountError } = await service
  .from("plays")
  .select("id", { count: "exact", head: true })
  .eq("user_id", userId);
assert.ifError(playCountError);
assert.equal(playCount, 0, "Mystery selection unexpectedly settled a paid/daily play");

console.log("SPECIAL_SCRATCH_CONCURRENCY_SUITE_PASSED");
