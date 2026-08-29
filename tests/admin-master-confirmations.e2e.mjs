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
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const password = `AdminConfirm-${randomUUID()}-Aa1!`;
let masterId;
let targetId;

async function createUser(prefix, displayName) {
  const email = `${prefix}-${suffix}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: displayName },
  });
  assert.ifError(error);
  assert.ok(data.user?.id, `${displayName} was not created`);
  return { id: data.user.id, email };
}

async function readWallet(userId) {
  const { data, error } = await admin
    .from("profiles")
    .select("balance,points,admin_role")
    .eq("id", userId)
    .single();
  assert.ifError(error);
  return {
    balance: Number(data.balance),
    points: data.points,
    adminRole: data.admin_role,
  };
}

async function login(page, email) {
  await page.goto(`${baseUrl}/`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Início", exact: true }).waitFor({ state: "visible" });
}

try {
  const master = await createUser("confirm-master", "Confirmation Master");
  masterId = master.id;
  const target = await createUser("confirm-target", "Confirmation Target");
  targetId = target.id;

  let result = await admin
    .from("profiles")
    .update({ admin_role: "admin_master" })
    .eq("id", master.id);
  assert.ifError(result.error);

  result = await admin.from("profiles").update({ balance: 25, points: 100 }).eq("id", target.id);
  assert.ifError(result.error);

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

    await login(page, master.email);
    await page.getByRole("tab", { name: "Admin", exact: true }).click();

    const adminPanel = page.locator('section[aria-labelledby="admin-panel-title"]');
    await adminPanel.waitFor({ state: "visible" });
    await adminPanel
      .getByText("Controle de Admin Master", { exact: true })
      .waitFor({ state: "visible" });

    const roleSelect = adminPanel.getByLabel("Papel de Confirmation Target", { exact: true });
    await roleSelect.waitFor({ state: "visible" });
    assert.equal(await roleSelect.inputValue(), "user", "target must begin as a regular user");
    await roleSelect.selectOption("admin");
    await roleSelect
      .locator("..")
      .getByRole("button", { name: "Salvar papel", exact: true })
      .click();

    let dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible" });
    await dialog
      .getByRole("heading", { name: "Confirmar alteração de papel?", exact: true })
      .waitFor({ state: "visible" });
    await dialog.getByText("Usuário → Admin", { exact: true }).waitFor({ state: "visible" });

    let targetWallet = await readWallet(target.id);
    assert.equal(targetWallet.adminRole, "user", "opening role confirmation changed the role");

    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    assert.equal(await roleSelect.inputValue(), "user", "cancel did not restore the original role");
    targetWallet = await readWallet(target.id);
    assert.equal(targetWallet.adminRole, "user", "cancelled role change reached the database");

    await adminPanel.locator("#master-user").selectOption(target.id);
    await adminPanel.locator("#master-balance-delta").fill("1.25");
    await adminPanel.locator("#master-points-delta").fill("7");
    await adminPanel.locator("#master-adjust-reason").fill("Browser confirmation gate");

    const before = await readWallet(target.id);
    await adminPanel.getByRole("button", { name: "Aplicar ajuste auditado", exact: true }).click();

    dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible" });
    await dialog
      .getByRole("heading", { name: "Confirmar ajuste administrativo?", exact: true })
      .waitFor({ state: "visible" });
    await dialog.getByText("Confirmation Target", { exact: true }).waitFor({ state: "visible" });
    await dialog
      .getByText("Browser confirmation gate", { exact: true })
      .waitFor({ state: "visible" });

    const beforeConfirmation = await readWallet(target.id);
    assert.deepEqual(
      beforeConfirmation,
      before,
      "opening wallet confirmation mutated the target before confirmation",
    );

    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    const afterCancel = await readWallet(target.id);
    assert.deepEqual(afterCancel, before, "cancelled wallet adjustment mutated the target");

    await adminPanel.getByRole("button", { name: "Aplicar ajuste auditado", exact: true }).click();
    dialog = page.getByRole("alertdialog");
    await dialog.waitFor({ state: "visible" });
    await dialog.getByRole("button", { name: "Confirmar ajuste", exact: true }).click();
    await page
      .getByText("Saldo/pontos ajustados com ledger e auditoria.", { exact: true })
      .waitFor({ state: "visible", timeout: 10_000 });
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });

    const after = await readWallet(target.id);
    assert.equal(
      after.balance,
      before.balance + 1.25,
      "confirmed credit delta was not applied once",
    );
    assert.equal(after.points, before.points + 7, "confirmed points delta was not applied once");
    assert.equal(after.adminRole, "user", "wallet adjustment changed the target role");

    const { count: creditEntries, error: creditError } = await admin
      .from("credit_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_id", target.id)
      .eq("transaction_type", "ADMIN_ADJUSTMENT")
      .contains("metadata", { reason: "Browser confirmation gate" });
    assert.ifError(creditError);
    assert.equal(
      creditEntries,
      1,
      "confirmed adjustment did not create exactly one credit ledger row",
    );

    const { count: pointsEntries, error: pointsError } = await admin
      .from("points_ledger")
      .select("id", { count: "exact", head: true })
      .eq("user_id", target.id)
      .eq("transaction_type", "ADMIN_ADJUSTMENT")
      .contains("metadata", { reason: "Browser confirmation gate" });
    assert.ifError(pointsError);
    assert.equal(
      pointsEntries,
      1,
      "confirmed adjustment did not create exactly one points ledger row",
    );

    assert.deepEqual(
      pageErrors,
      [],
      `Admin Master confirmation flow emitted page errors: ${pageErrors.join(" | ")}`,
    );
    assert.deepEqual(
      consoleErrors,
      [],
      `Admin Master confirmation flow emitted console errors: ${consoleErrors.join(" | ")}`,
    );

    await page.screenshot({
      path: "playwright-artifacts/admin-master-confirmations-1440x900.png",
      fullPage: true,
    });
    await context.close();
  } finally {
    await browser.close();
  }

  console.log("ADMIN_MASTER_CONFIRMATIONS_E2E_PASSED");
} finally {
  if (targetId) await admin.auth.admin.deleteUser(targetId);
  if (masterId) await admin.auth.admin.deleteUser(masterId);
}
