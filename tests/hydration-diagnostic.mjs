import assert from "node:assert/strict";
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

function attachHydrationGuard(page) {
  const errors = [];
  page.on("pageerror", (error) => {
    errors.push(`${page.url()} :: ${error.message}`);
  });

  return async (checkpoint) => {
    await page.waitForTimeout(100);
    if (errors.length) {
      throw new Error(`HYDRATION_DIAGNOSTIC_FAILED at ${checkpoint}: ${errors.join(" | ")}`);
    }
    console.log(`HYDRATION_CHECKPOINT_OK ${checkpoint} ${page.url()}`);
  };
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Início" }).waitFor({ state: "visible" });
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `hydration-${suffix}@example.invalid`;
const password = `Hydration-${suffix}-Aa1!`;
let userId;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Hydration QA" },
  });
  if (createError) throw createError;
  assert.ok(created.user, "local Auth did not create the diagnostic user");
  userId = created.user.id;

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const assertHydration = attachHydrationGuard(page);

    await page.goto(`${baseUrl}/`);
    await page.getByRole("heading", { name: "Raspadinha Online" }).waitFor({ state: "visible" });
    await assertHydration("public-root-desktop");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${baseUrl}/`);
    await page.getByRole("heading", { name: "Raspadinha Online" }).waitFor({ state: "visible" });
    await assertHydration("public-root-mobile");

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`${baseUrl}/transparencia`);
    await page.getByRole("heading", { name: "Centro de Transparência" }).waitFor({ state: "visible" });
    await page.getByText("Probabilidade configurada", { exact: true }).first().waitFor({ state: "visible" });
    await assertHydration("public-transparency");

    await login(page, email, password);
    await assertHydration("login-to-app");

    await page.goto(`${baseUrl}/app`);
    await page.getByRole("tab", { name: "Início" }).waitFor({ state: "visible" });
    await assertHydration("authenticated-app-direct");

    await page.getByRole("tab", { name: "Perfil" }).click();
    await page.getByText("Perfil público", { exact: true }).first().waitFor({ state: "visible" });
    await page.reload();
    await page.getByRole("tab", { name: "Início" }).waitFor({ state: "visible" });
    await assertHydration("authenticated-app-profile-reload");

    const { error: promoteError } = await admin.from("profiles").update({ is_admin: true }).eq("id", userId);
    if (promoteError) throw promoteError;

    await page.reload();
    await page.getByRole("tab", { name: "Admin", exact: true }).waitFor({ state: "visible" });
    await assertHydration("authenticated-app-admin-reload");

    await context.close();
  } finally {
    await browser.close();
  }

  console.log("HYDRATION_DIAGNOSTIC_PASSED");
} finally {
  if (userId) await admin.auth.admin.deleteUser(userId);
}
