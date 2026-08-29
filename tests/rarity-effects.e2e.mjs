import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const ALLOWED_RARITIES = new Set(["bronze", "prata", "ouro", "diamante"]);

function requireLocalUrl(name, value) {
  assert.ok(value, `${name} is required`);
  const url = new URL(value);
  assert.ok(LOCAL_HOSTS.has(url.hostname), `${name} must point to localhost, got ${url.hostname}`);
  return url.origin;
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  assert.ok(
    metrics.documentScrollWidth <= metrics.clientWidth + 1 &&
      metrics.bodyScrollWidth <= metrics.clientWidth + 1,
    `${label} overflows horizontally`,
  );
}

async function assertDesktopEffectsHidden(scope, label) {
  const visibleCount = await scope.locator('[data-effect-tier="desktop"]').evaluateAll((elements) =>
    elements.filter((element) => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        rect.width > 0 &&
        rect.height > 0
      );
    }).length,
  );
  assert.equal(visibleCount, 0, `${label} must hide desktop-only effects on mobile`);
}

const baseUrl = requireLocalUrl("E2E_BASE_URL", process.env.E2E_BASE_URL);
const supabaseUrl = requireLocalUrl("SUPABASE_URL", process.env.SUPABASE_URL);
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(publishableKey, "SUPABASE_PUBLISHABLE_KEY is required");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required for isolated fixture setup");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const userClient = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `rarity-${suffix}@example.invalid`;
const password = `Rarity-${suffix}-Aa1!`;
let userId;

await mkdir("playwright-artifacts", { recursive: true });

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Rarity Effects E2E" },
  });
  if (createError) throw createError;
  assert.ok(created.user, "local Auth did not return the rarity fixture user");
  userId = created.user.id;

  const { error: profileError } = await admin
    .from("profiles")
    .update({ balance: 100, points: 2_000, is_admin: true })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { data: publishedVersion, error: versionError } = await admin
    .from("scratch_math_versions")
    .select("scratchcard_id")
    .eq("status", "PUBLISHED")
    .limit(1)
    .single();
  if (versionError) throw versionError;
  assert.ok(publishedVersion?.scratchcard_id, "rarity fixture needs a published scratch version");

  const { error: signInError } = await userClient.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;

  const { data: poolId, error: poolError } = await userClient.rpc("admin_create_mystery_draft_v1", {
    p_name: "Rarity Effects Pool",
  });
  if (poolError) throw poolError;
  assert.ok(poolId, "rarity fixture did not create a Mystery pool");

  const { error: entryError } = await userClient.rpc("admin_add_mystery_entry_v1", {
    p_mystery_version_id: poolId,
    p_scratchcard_id: publishedVersion.scratchcard_id,
    p_weight: 1,
  });
  if (entryError) throw entryError;

  const { data: publishedPool, error: publishError } = await userClient.rpc(
    "admin_publish_mystery_v1",
    { p_mystery_version_id: poolId },
  );
  if (publishError) throw publishError;
  assert.equal(publishedPool?.status, "PUBLISHED", "rarity fixture Mystery pool did not publish");
  await userClient.auth.signOut();

  const { error: demoteError } = await admin
    .from("profiles")
    .update({ is_admin: false })
    .eq("id", userId);
  if (demoteError) throw demoteError;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const pageErrors = [];
    const consoleErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });

    await page.goto(`${baseUrl}/`);
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
    await page.getByRole("tab", { name: "Raspadinhas" }).click();

    const mysteryPanel = page.getByTestId("mystery-panel");
    await mysteryPanel.waitFor({ state: "visible" });
    await assertDesktopEffectsHidden(mysteryPanel, "Mystery panel");

    await mysteryPanel.getByRole("button", { name: "Abrir misteriosa", exact: true }).click();
    const mysteryResult = page.getByTestId("scratch-result-card");
    await mysteryResult.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await mysteryResult.getAttribute("data-visual-rarity"),
      "misteriosa",
      "Mystery must keep its own visual identity independent of settled rarity",
    );
    await assertDesktopEffectsHidden(mysteryResult, "Mystery result");
    await page.getByRole("button", { name: "Revelar resultado", exact: true }).click();
    await page
      .getByRole("button", { name: "Fechar resultado", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    await assertNoHorizontalOverflow(page, "Mystery rarity effects mobile");
    await page.getByRole("button", { name: "Fechar resultado", exact: true }).click();

    const firstOption = page.locator('[data-testid^="scratch-option-"]').first();
    await firstOption.waitFor({ state: "visible" });
    const expectedRarity = await firstOption.getAttribute("data-rarity");
    assert.ok(ALLOWED_RARITIES.has(expectedRarity), `unexpected scratch rarity ${expectedRarity}`);
    await firstOption.getByRole("button", { name: "Comprar e Jogar", exact: true }).click();

    const regularResult = page.getByTestId("scratch-result-card");
    await regularResult.waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await regularResult.getAttribute("data-visual-rarity"),
      expectedRarity,
      "regular scratch result must preserve its rarity visual identity",
    );
    await assertDesktopEffectsHidden(regularResult, "Regular scratch result");
    await page.getByRole("button", { name: "Revelar resultado", exact: true }).click();
    await page
      .getByRole("button", { name: "Jogar Novamente", exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    await assertNoHorizontalOverflow(page, "regular rarity effects mobile");

    assert.deepEqual(pageErrors, [], `rarity effects emitted page errors: ${pageErrors.join(" | ")}`);
    assert.deepEqual(
      consoleErrors,
      [],
      `rarity effects emitted console errors: ${consoleErrors.join(" | ")}`,
    );

    await page.screenshot({
      path: "playwright-artifacts/rarity-effects-mobile-390x844.png",
      fullPage: true,
    });
    console.log("RARITY_EFFECTS_E2E_PASSED");
    await context.close();
  } finally {
    await browser.close();
  }
} finally {
  await userClient.auth.signOut().catch(() => undefined);
  if (userId) await admin.auth.admin.deleteUser(userId);
}
