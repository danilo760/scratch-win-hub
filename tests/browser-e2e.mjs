import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);
const VIEWPORTS = [
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  { width: 768, height: 1024 },
  { width: 1440, height: 900 },
];

function requireLocalUrl(name, value) {
  assert.ok(value, `${name} is required`);
  const url = new URL(value);
  assert.ok(LOCAL_HOSTS.has(url.hostname), `${name} must point to localhost, got ${url.hostname}`);
  return url.origin;
}

const baseUrl = requireLocalUrl("E2E_BASE_URL", process.env.E2E_BASE_URL);
const supabaseUrl = requireLocalUrl("SUPABASE_URL", process.env.SUPABASE_URL);
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required for isolated fixture setup");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const artifactDir = "playwright-artifacts";
await mkdir(artifactDir, { recursive: true });

function attachRuntimeGuards(page, label) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  return () => {
    assert.deepEqual(pageErrors, [], `${label} emitted uncaught page errors: ${pageErrors.join(" | ")}`);
    assert.deepEqual(consoleErrors, [], `${label} emitted console errors: ${consoleErrors.join(" | ")}`);
  };
}

async function assertNoBlankScreen(page, label) {
  const bodyText = (await page.locator("body").innerText()).trim();
  assert.ok(bodyText.length > 20, `${label} rendered an effectively blank body`);
  assert.ok(!bodyText.includes("RUNTIME_ERROR"), `${label} rendered a runtime error boundary`);
}

async function assertNoHorizontalOverflow(page, label) {
  const metrics = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    documentScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
  }));
  const allowed = metrics.clientWidth + 1;
  assert.ok(
    metrics.documentScrollWidth <= allowed && metrics.bodyScrollWidth <= allowed,
    `${label} overflows horizontally: client=${metrics.clientWidth}, document=${metrics.documentScrollWidth}, body=${metrics.bodyScrollWidth}`,
  );
}

async function login(page, email, password) {
  await page.goto(`${baseUrl}/`);
  await page.locator("#login-email").fill(email);
  await page.locator("#login-password").fill(password);
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Início" }).waitFor({ state: "visible" });
}

async function exercisePublicViewports(page) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/`);
    await page.getByRole("heading", { name: "Raspadinha Online" }).waitFor({ state: "visible" });
    await assertNoBlankScreen(page, `public ${viewport.width}x${viewport.height}`);
    await assertNoHorizontalOverflow(page, `public ${viewport.width}x${viewport.height}`);
    const lang = await page.locator("html").getAttribute("lang");
    assert.equal(lang, "pt-BR", "root html lang must remain pt-BR");
    await page.screenshot({
      path: `${artifactDir}/public-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  }

  await page.goto(`${baseUrl}/transparencia`);
  await page.getByRole("heading", { name: "Centro de Transparência" }).waitFor({ state: "visible" });
  await assertNoHorizontalOverflow(page, "transparency page");
}

async function exerciseAuthenticatedViewports(page) {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${baseUrl}/app`);
    await page.getByRole("tab", { name: "Início" }).waitFor({ state: "visible" });
    await assertNoBlankScreen(page, `app ${viewport.width}x${viewport.height}`);
    await assertNoHorizontalOverflow(page, `app ${viewport.width}x${viewport.height}`);
    await page.screenshot({
      path: `${artifactDir}/app-${viewport.width}x${viewport.height}.png`,
      fullPage: true,
    });
  }
}

async function exerciseScratchAndStore(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Raspadinhas" }).click();
  await page.getByRole("heading", { name: "Raspadinhas" }).waitFor({ state: "visible" });
  const playButton = page.getByRole("button", { name: "Comprar e Jogar" }).first();
  await playButton.waitFor({ state: "visible" });
  await playButton.click();
  const revealButton = page.getByRole("button", { name: "Revelar resultado" });
  await revealButton.waitFor({ state: "visible" });
  await revealButton.click();
  await page.getByRole("button", { name: "Jogar Novamente" }).waitFor({ state: "visible" });
  await assertNoHorizontalOverflow(page, "revealed scratchcard");

  await page.getByRole("button", { name: "Jogar Novamente" }).click();
  await page.getByRole("tab", { name: "Loja" }).click();
  await page.getByText("Camiseta Exclusiva", { exact: true }).waitFor({ state: "visible" });
  const redeemButton = page.getByRole("button", { name: "Resgatar Item" }).first();
  assert.equal(await redeemButton.isEnabled(), true, "seeded store item must be redeemable by the fixture user");
  await redeemButton.click();
  await page.getByText(/Prêmio solicitado! Protocolo:/).waitFor({ state: "visible", timeout: 10_000 });

  await page.getByRole("tab", { name: "Prêmios" }).click();
  await page.getByText("Meus Prêmios", { exact: true }).first().waitFor({ state: "visible" });
  await page.getByText("Camiseta Exclusiva", { exact: true }).waitFor({ state: "visible" });
  await assertNoHorizontalOverflow(page, "my rewards");
}

async function exerciseProfile(page) {
  await page.getByRole("tab", { name: "Perfil" }).click();
  await page.getByText("Perfil público", { exact: true }).first().waitFor({ state: "visible" });
  const nameInput = page.locator("input").first();
  await nameInput.fill("Browser QA");
  await page.getByRole("button", { name: "Salvar perfil" }).click();
  await page.getByText("Preferências salvas", { exact: true }).waitFor({ state: "visible" });
  await page.reload();
  await page.getByRole("tab", { name: "Perfil" }).click();
  await page.getByText("Perfil público", { exact: true }).first().waitFor({ state: "visible" });
  assert.equal(await page.locator("input").first().inputValue(), "Browser QA", "profile preference did not persist");
}

async function exerciseTouchScratch(browser, email, password) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const assertRuntime = attachRuntimeGuards(page, "touch scratch context");
  try {
    await login(page, email, password);
    await page.getByRole("tab", { name: "Raspadinhas" }).click();
    const playButton = page.getByRole("button", { name: "Comprar e Jogar" }).first();
    await playButton.waitFor({ state: "visible" });
    await playButton.click();
    const canvas = page.getByRole("img", { name: /Área de raspagem/ });
    await canvas.waitFor({ state: "visible" });
    const box = await canvas.boundingBox();
    assert.ok(box, "scratch canvas has no bounding box");

    for (let y = 14; y < box.height - 8; y += 24) {
      for (let x = 14; x < box.width - 8; x += 24) {
        await page.touchscreen.tap(box.x + x, box.y + y);
      }
      await page.waitForTimeout(150);
      if (await page.getByRole("button", { name: "Jogar Novamente" }).isVisible()) break;
    }

    await page.getByRole("button", { name: "Jogar Novamente" }).waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await page.getByRole("button", { name: "Revelar resultado" }).isVisible(),
      false,
      "touch scratching did not reveal the result naturally",
    );
    await assertNoHorizontalOverflow(page, "touch scratch result");
    await page.screenshot({ path: `${artifactDir}/touch-scratch-390x844.png`, fullPage: true });
    assertRuntime();
  } finally {
    await context.close();
  }
}

const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const email = `browser-${suffix}@example.invalid`;
const password = `Browser-${suffix}-Aa1!`;
let userId;

try {
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: "Browser E2E" },
  });
  if (createError) throw createError;
  assert.ok(created.user, "local Auth did not return the created browser fixture user");
  userId = created.user.id;

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .update({ balance: 100, points: 2_000 })
    .eq("id", userId)
    .select("id, display_name, public_slug, is_admin, balance, points")
    .single();
  if (profileError) throw profileError;
  assert.equal(profile.is_admin, false, "browser fixture must not become admin");
  assert.ok(profile.display_name, "signup trigger must create display_name");
  assert.ok(profile.public_slug, "signup trigger must create public_slug");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const assertRuntime = attachRuntimeGuards(page, "primary browser context");

    await exercisePublicViewports(page);
    await login(page, email, password);
    await exerciseAuthenticatedViewports(page);
    await exerciseScratchAndStore(page);
    await exerciseProfile(page);

    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    await page.goto(`${baseUrl}/app`);
    await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
    await page.getByRole("button", { name: "Entrar", exact: true }).waitFor({ state: "visible" });

    assertRuntime();
    await context.close();
    await exerciseTouchScratch(browser, email, password);
  } finally {
    await browser.close();
  }

  console.log("BROWSER_E2E_SUITE_PASSED");
} finally {
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
  }
}
