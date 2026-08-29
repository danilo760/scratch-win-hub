import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
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
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required for isolated fixture setup");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `realtime-${suffix}@example.invalid`;
const password = `Realtime-${suffix}-Aa1!`;
let userId;

await mkdir("playwright-artifacts", { recursive: true });

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Realtime E2E" },
  });
  if (createError) throw createError;
  assert.ok(created.user, "local Auth did not return the Realtime fixture user");
  userId = created.user.id;

  const { error: seedError } = await admin
    .from("profiles")
    .update({ balance: 100, points: 2_000 })
    .eq("id", userId);
  if (seedError) throw seedError;

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

    await page.goto(`${baseUrl}/`);
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });

    const realtimeStatus = page.getByTestId("realtime-status");
    await realtimeStatus.waitFor({ state: "visible" });
    await realtimeStatus.getByText("Ao vivo", { exact: true }).waitFor({
      state: "visible",
      timeout: 15_000,
    });

    assert.match(await page.getByTestId("header-balance").innerText(), /100,00/);
    assert.equal((await page.getByTestId("header-points").innerText()).trim(), "2000");
    assert.equal(
      await page.getByRole("tab", { name: "Admin", exact: true }).count(),
      0,
      "regular user must not see Admin before promotion",
    );

    const { error: externalUpdateError } = await admin
      .from("profiles")
      .update({ balance: 125.5, points: 2_222, admin_role: "admin" })
      .eq("id", userId);
    if (externalUpdateError) throw externalUpdateError;

    await page
      .getByTestId("header-balance")
      .filter({ hasText: "125,50" })
      .waitFor({ state: "visible", timeout: 15_000 });
    await page
      .getByTestId("header-points")
      .filter({ hasText: "2222" })
      .waitFor({ state: "visible", timeout: 15_000 });

    const adminTab = page.getByRole("tab", { name: "Admin", exact: true });
    await adminTab.waitFor({ state: "visible", timeout: 15_000 });
    const adminShortcut = page.getByRole("button", { name: "Abrir painel", exact: true });
    await adminShortcut.waitFor({ state: "visible", timeout: 15_000 });
    await adminShortcut.click();
    await page
      .getByRole("heading", { name: "Painel Administrativo", exact: true })
      .waitFor({ state: "visible", timeout: 15_000 });

    assert.equal(
      pageErrors.length,
      0,
      `Realtime visual sync emitted page errors: ${pageErrors.join(" | ")}`,
    );
    assert.equal(
      consoleErrors.length,
      0,
      `Realtime visual sync emitted console errors: ${consoleErrors.join(" | ")}`,
    );

    await page.screenshot({
      path: "playwright-artifacts/realtime-admin-promotion-1440x900.png",
      fullPage: true,
    });

    console.log("REALTIME_VISUAL_SYNC_E2E_PASSED");
    await context.close();
  } finally {
    await browser.close();
  }
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}
