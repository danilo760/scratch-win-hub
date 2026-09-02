import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

function requireLocalUrl(name, value) {
  assert.ok(value, `${name} is required`);
  const url = new URL(value);
  assert.ok(LOCAL_HOSTS.has(url.hostname), `${name} must point to localhost, got ${url.hostname}`);
  return url.origin;
}

const baseUrl = requireLocalUrl("E2E_BASE_URL", process.env.E2E_BASE_URL);
const supabaseUrl = requireLocalUrl("SUPABASE_URL", process.env.SUPABASE_URL);
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(publishableKey, "SUPABASE_PUBLISHABLE_KEY is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const email = `mystery-confirm-${suffix}@example.invalid`;
const password = `MysteryConfirm-${randomUUID()}-Aa1!`;

async function login(page) {
  await page.goto(`${baseUrl}/`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Início", exact: true }).waitFor({ state: "visible" });
}

async function readMysteryVersion(versionId) {
  const { data, error } = await admin
    .from("mystery_versions")
    .select("id,name,status,published_at")
    .eq("id", versionId)
    .single();
  assert.ifError(error);
  return data;
}

async function readMysteryEntries(versionId) {
  const { data, error } = await admin
    .from("mystery_version_entries")
    .select("id,scratchcard_id,weight")
    .eq("mystery_version_id", versionId)
    .order("id");
  assert.ifError(error);
  return data ?? [];
}

async function createPublishedCard(client, label) {
  const { data: cardId, error: cardError } = await client.rpc("admin_upsert_scratchcard_v1", {
    p_title: `Mystery Confirmation ${label} ${suffix}`,
    p_price: 1,
    p_active: true,
    p_is_daily_eligible: false,
  });
  assert.ifError(cardError);
  assert.ok(cardId, `${label} scratchcard was not created`);

  const { data: versionId, error: draftError } = await client.rpc("create_math_draft_v1", {
    p_card_id: cardId,
    p_version_name: `MYSTERY-${label}-${suffix}`,
    p_rarity_slug: "bronze",
  });
  assert.ifError(draftError);
  assert.ok(versionId, `${label} math DRAFT was not created`);

  const { error: outcomeError } = await client.rpc("add_math_outcome_v1", {
    p_math_version_id: versionId,
    p_name: `${label} fixture outcome`,
    p_prize: 0,
    p_points: 1,
    p_weight: 1,
  });
  assert.ifError(outcomeError);

  const { error: publishError } = await client.rpc("publish_math_version_v1", {
    p_math_version_id: versionId,
  });
  assert.ifError(publishError);

  return { cardId, versionId };
}

const { data: created, error: createUserError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "Mystery Confirmation Master" },
});
assert.ifError(createUserError);
assert.ok(created.user?.id, "mystery confirmation master was not created");
const masterId = created.user.id;

const { error: promoteError } = await admin
  .from("profiles")
  .update({ admin_role: "admin_master" })
  .eq("id", masterId);
assert.ifError(promoteError);

const fixtureAdmin = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let mysteryVersionId;
let firstCardId;
let secondCardId;

try {
  const { error: signInError } = await fixtureAdmin.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);

  const firstCard = await createPublishedCard(fixtureAdmin, "A");
  const secondCard = await createPublishedCard(fixtureAdmin, "B");
  firstCardId = firstCard.cardId;
  secondCardId = secondCard.cardId;

  const { data: newMysteryVersionId, error: mysteryDraftError } = await fixtureAdmin.rpc(
    "admin_create_mystery_draft_v1",
    { p_name: `MYSTERY CONFIRM ${suffix}` },
  );
  assert.ifError(mysteryDraftError);
  assert.ok(newMysteryVersionId, "mystery DRAFT was not created");
  mysteryVersionId = newMysteryVersionId;

  for (const entry of [
    { cardId: firstCardId, weight: 3 },
    { cardId: secondCardId, weight: 1 },
  ]) {
    const { error } = await fixtureAdmin.rpc("admin_add_mystery_entry_v1", {
      p_mystery_version_id: mysteryVersionId,
      p_scratchcard_id: entry.cardId,
      p_weight: entry.weight,
    });
    assert.ifError(error);
  }
} finally {
  await fixtureAdmin.auth.signOut();
}

assert.equal((await readMysteryVersion(mysteryVersionId)).status, "DRAFT");
assert.equal((await readMysteryEntries(mysteryVersionId)).length, 2);

const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await login(page);
  await page.getByRole("tab", { name: "Admin", exact: true }).click();
  const adminPanel = page.locator('section[aria-labelledby="admin-panel-title"]');
  await adminPanel.waitFor({ state: "visible" });
  await adminPanel.getByRole("tab", { name: "Misteriosa", exact: true }).click();
  await adminPanel.getByText("Pool e pesos", { exact: true }).waitFor({ state: "visible" });

  const poolSelect = adminPanel.getByLabel("Pool Misteriosa", { exact: true });
  await poolSelect.selectOption(mysteryVersionId);

  const removeButtons = adminPanel.getByRole("button", {
    name: "Remover entrada da Misteriosa",
    exact: true,
  });
  assert.equal(await removeButtons.count(), 2, "fixture must expose two removable mystery entries");

  await removeButtons.first().click();
  let dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog
    .getByRole("heading", { name: "Remover entrada do DRAFT da Misteriosa?", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    (await readMysteryEntries(mysteryVersionId)).length,
    2,
    "opening mystery removal confirmation mutated entries",
  );

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    (await readMysteryEntries(mysteryVersionId)).length,
    2,
    "cancelled mystery entry removal mutated entries",
  );

  await removeButtons.first().click();
  dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Confirmar remoção", exact: true }).click();
  await page.getByText("Entrada removida.", { exact: true }).waitFor({ state: "visible" });
  await dialog.waitFor({ state: "hidden" });

  const remainingEntries = await readMysteryEntries(mysteryVersionId);
  assert.equal(remainingEntries.length, 1, "confirmed removal did not remove exactly one entry");
  assert.ok(
    [firstCardId, secondCardId].includes(remainingEntries[0].scratchcard_id),
    "remaining entry points outside the isolated fixture cards",
  );

  const publishButton = adminPanel.getByRole("button", { name: "Publicar pool", exact: true });
  await publishButton.click();
  dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog
    .getByRole("heading", { name: "Publicar pool da Misteriosa?", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    (await readMysteryVersion(mysteryVersionId)).status,
    "DRAFT",
    "opening mystery publish confirmation changed status",
  );

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    (await readMysteryVersion(mysteryVersionId)).status,
    "DRAFT",
    "cancelled mystery publication changed status",
  );

  await publishButton.click();
  dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await page
    .getByText("Pool Misteriosa publicado e bloqueado para edição.", { exact: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });

  const published = await readMysteryVersion(mysteryVersionId);
  assert.equal(
    published.status,
    "PUBLISHED",
    "confirmed mystery publication did not publish DRAFT",
  );
  assert.ok(published.published_at, "published mystery version has no published_at timestamp");
  assert.equal(
    (await readMysteryEntries(mysteryVersionId)).length,
    1,
    "mystery publication changed the remaining entry set",
  );

  const { data: publishedPools, error: publishedPoolsError } = await admin
    .from("mystery_versions")
    .select("id,status")
    .eq("status", "PUBLISHED");
  assert.ifError(publishedPoolsError);
  assert.equal(publishedPools?.length, 1, "there must be exactly one published mystery pool");
  assert.equal(
    publishedPools?.[0]?.id,
    mysteryVersionId,
    "the isolated pool is not the published pool",
  );

  assert.deepEqual(
    pageErrors,
    [],
    `mystery confirmation flow emitted page errors: ${pageErrors.join(" | ")}`,
  );
  assert.deepEqual(
    consoleErrors,
    [],
    `mystery confirmation flow emitted console errors: ${consoleErrors.join(" | ")}`,
  );

  await page.screenshot({
    path: "playwright-artifacts/admin-mystery-confirmations-1440x900.png",
    fullPage: true,
  });
  await context.close();
} finally {
  await browser.close();
}

console.log("ADMIN_MYSTERY_CONFIRMATIONS_E2E_PASSED");
