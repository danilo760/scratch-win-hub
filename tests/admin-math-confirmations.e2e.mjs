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
const email = `math-confirm-${suffix}@example.invalid`;
const password = `MathConfirm-${randomUUID()}-Aa1!`;

async function login(page) {
  await page.goto(`${baseUrl}/`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Início", exact: true }).waitFor({ state: "visible" });
}

async function readVersion(versionId) {
  const { data, error } = await admin
    .from("scratch_math_versions")
    .select("id,status,scratchcard_id")
    .eq("id", versionId)
    .single();
  assert.ifError(error);
  return data;
}

async function countOutcomes(versionId) {
  const { count, error } = await admin
    .from("scratch_outcomes")
    .select("id", { count: "exact", head: true })
    .eq("math_version_id", versionId);
  assert.ifError(error);
  return count ?? 0;
}

const { data: created, error: createUserError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { display_name: "Math Confirmation Master" },
});
assert.ifError(createUserError);
assert.ok(created.user?.id, "math confirmation master was not created");
const masterId = created.user.id;

const { error: promoteError } = await admin
  .from("profiles")
  .update({ admin_role: "admin_master" })
  .eq("id", masterId);
assert.ifError(promoteError);

const fixtureAdmin = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let cardId;
let versionId;

try {
  const { error: signInError } = await fixtureAdmin.auth.signInWithPassword({ email, password });
  assert.ifError(signInError);

  const { data: newCardId, error: cardError } = await fixtureAdmin.rpc(
    "admin_upsert_scratchcard_v1",
    {
      p_title: `Math Confirmation Card ${suffix}`,
      p_price: 1,
      p_active: true,
      p_is_daily_eligible: false,
    },
  );
  assert.ifError(cardError);
  assert.ok(newCardId, "admin_upsert_scratchcard_v1 did not return a card id");
  cardId = newCardId;

  const { data: newVersionId, error: draftError } = await fixtureAdmin.rpc("create_math_draft_v1", {
    p_card_id: cardId,
    p_version_name: `CONFIRM-${suffix}`,
    p_rarity_slug: "bronze",
  });
  assert.ifError(draftError);
  assert.ok(newVersionId, "create_math_draft_v1 did not return a version id");
  versionId = newVersionId;

  for (const outcome of [
    { name: "Keep Outcome", prize: 0, points: 5, weight: 3 },
    { name: "Remove Outcome", prize: 1, points: 0, weight: 1 },
  ]) {
    const { error } = await fixtureAdmin.rpc("add_math_outcome_v1", {
      p_math_version_id: versionId,
      p_name: outcome.name,
      p_prize: outcome.prize,
      p_points: outcome.points,
      p_weight: outcome.weight,
    });
    assert.ifError(error);
  }
} finally {
  await fixtureAdmin.auth.signOut();
}

assert.equal(await countOutcomes(versionId), 2, "math fixture must start with two outcomes");
assert.equal((await readVersion(versionId)).status, "DRAFT", "math fixture must begin as DRAFT");

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
  await adminPanel.getByRole("tab", { name: "Versões Matemáticas", exact: true }).click();
  await adminPanel.getByText("Versões e resultados", { exact: true }).waitFor({ state: "visible" });

  const versionSelect = adminPanel.locator("#math-version");
  await versionSelect.selectOption(versionId);
  await adminPanel.getByText("DRAFT", { exact: true }).first().waitFor({ state: "visible" });

  const removeButtons = adminPanel.getByRole("button", { name: "Remover outcome", exact: true });
  assert.equal(await removeButtons.count(), 2, "fixture must expose two removable outcomes");
  await removeButtons.first().click();

  let dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog
    .getByRole("heading", { name: "Remover outcome do DRAFT?", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(await countOutcomes(versionId), 2, "opening removal confirmation mutated outcomes");

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(await countOutcomes(versionId), 2, "cancelled removal mutated outcomes");

  await removeButtons.first().click();
  dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Confirmar remoção", exact: true }).click();
  await page.getByText("Outcome removido.", { exact: true }).waitFor({ state: "visible" });
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    await countOutcomes(versionId),
    1,
    "confirmed removal did not remove exactly one outcome",
  );

  const publishButton = adminPanel.getByRole("button", { name: "Publicar versão", exact: true });
  await publishButton.click();
  dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog
    .getByRole("heading", { name: "Publicar versão matemática?", exact: true })
    .waitFor({ state: "visible" });
  assert.equal(
    (await readVersion(versionId)).status,
    "DRAFT",
    "opening publish confirmation changed status",
  );

  await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" });
  assert.equal(
    (await readVersion(versionId)).status,
    "DRAFT",
    "cancelled publication changed status",
  );

  await publishButton.click();
  dialog = page.getByRole("alertdialog");
  await dialog.waitFor({ state: "visible" });
  await dialog.getByRole("button", { name: "Confirmar publicação", exact: true }).click();
  await page
    .getByText("Versão publicada e bloqueada para edição.", { exact: true })
    .waitFor({ state: "visible", timeout: 10_000 });
  await dialog.waitFor({ state: "hidden", timeout: 10_000 });

  const published = await readVersion(versionId);
  assert.equal(published.status, "PUBLISHED", "confirmed publication did not publish the DRAFT");
  assert.equal(published.scratchcard_id, cardId, "published version changed scratchcard");
  assert.equal(await countOutcomes(versionId), 1, "publication changed the remaining outcome set");

  const { count: publishedForCard, error: publishedCountError } = await admin
    .from("scratch_math_versions")
    .select("id", { count: "exact", head: true })
    .eq("scratchcard_id", cardId)
    .eq("status", "PUBLISHED");
  assert.ifError(publishedCountError);
  assert.equal(publishedForCard, 1, "card must have exactly one published math version");

  assert.deepEqual(
    pageErrors,
    [],
    `math confirmation flow emitted page errors: ${pageErrors.join(" | ")}`,
  );
  assert.deepEqual(
    consoleErrors,
    [],
    `math confirmation flow emitted console errors: ${consoleErrors.join(" | ")}`,
  );

  await page.screenshot({
    path: "playwright-artifacts/admin-math-confirmations-1440x900.png",
    fullPage: true,
  });
  await context.close();
} finally {
  await browser.close();
}

console.log("ADMIN_MATH_CONFIRMATIONS_E2E_PASSED");
