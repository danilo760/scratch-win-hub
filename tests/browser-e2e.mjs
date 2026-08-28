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
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(publishableKey, "SUPABASE_PUBLISHABLE_KEY is required for browser auth validation");
assert.ok(serviceRoleKey, "SUPABASE_SERVICE_ROLE_KEY is required for isolated fixture setup");

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const publicAuth = createClient(supabaseUrl, publishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const artifactDir = "playwright-artifacts";
await mkdir(artifactDir, { recursive: true });

function attachRuntimeGuards(page, label) {
  const pageErrors = [];
  const consoleErrors = [];
  page.on("pageerror", (error) => pageErrors.push(`${page.url()} :: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(`${page.url()} :: ${message.text()}`);
  });
  return (checkpoint = label) => {
    const checkpointPageErrors = pageErrors.splice(0);
    const checkpointConsoleErrors = consoleErrors.splice(0);
    assert.deepEqual(
      checkpointPageErrors,
      [],
      `${checkpoint} emitted uncaught page errors: ${checkpointPageErrors.join(" | ")}`,
    );
    assert.deepEqual(
      checkpointConsoleErrors,
      [],
      `${checkpoint} emitted console errors: ${checkpointConsoleErrors.join(" | ")}`,
    );
    console.log(`BROWSER_RUNTIME_CHECKPOINT_OK ${checkpoint} ${page.url()}`);
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
  const authStatuses = [];
  const recordAuth = (response) => {
    if (response.url().includes("/auth/v1/token")) authStatuses.push(response.status());
  };
  page.on("response", recordAuth);
  try {
    await page.goto(`${baseUrl}/`);
    await page.locator("#login-email").fill(email);
    await page.locator("#login-password").fill(password);
    await page.getByRole("button", { name: "Entrar", exact: true }).click();
    try {
      await page.waitForURL((url) => url.pathname === "/app", { timeout: 15_000 });
    } catch (error) {
      const body = (await page.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 800);
      throw new Error(
        `Browser login did not reach /app; auth token HTTP statuses=[${authStatuses.join(",")}], current=${page.url()}, body=${JSON.stringify(body)}`,
        { cause: error },
      );
    }
    await page.getByRole("tab", { name: "Início" }).waitFor({ state: "visible" });
  } finally {
    page.off("response", recordAuth);
  }
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
  await page
    .getByRole("heading", { name: "Centro de Transparência" })
    .waitFor({ state: "visible" });
  await page
    .getByText("Campanhas publicadas", { exact: true })
    .first()
    .waitFor({ state: "visible" });
  await page
    .getByText("Probabilidade configurada", { exact: true })
    .first()
    .waitFor({ state: "visible" });
  await assertNoBlankScreen(page, "transparency page");
  await assertNoHorizontalOverflow(page, "transparency page");
  await page.screenshot({ path: `${artifactDir}/transparency-1440x900.png`, fullPage: true });
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
  assert.equal(
    await redeemButton.isEnabled(),
    true,
    "seeded store item must be redeemable by the fixture user",
  );
  await redeemButton.click();
  await page
    .getByText(/Prêmio solicitado! Protocolo:/)
    .waitFor({ state: "visible", timeout: 10_000 });

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
  assert.equal(
    await page.locator("input").first().inputValue(),
    "Browser QA",
    "profile preference did not persist",
  );
}

async function exerciseAdmin(page, userId) {
  const { error: promoteError } = await admin
    .from("profiles")
    .update({ is_admin: true })
    .eq("id", userId);
  if (promoteError) throw promoteError;

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  const adminTab = page.getByRole("tab", { name: "Admin", exact: true });
  await adminTab.waitFor({ state: "visible" });
  await adminTab.click();

  await page
    .getByRole("heading", { name: "Indicadores operacionais" })
    .waitFor({ state: "visible" });
  await page
    .getByText(/America\/Sao_Paulo/)
    .first()
    .waitFor({ state: "visible" });
  await assertNoBlankScreen(page, "admin operations");
  await assertNoHorizontalOverflow(page, "admin operations");
  await page.screenshot({ path: `${artifactDir}/admin-operations-1440x900.png`, fullPage: true });

  await page.getByRole("tab", { name: "Auditoria Matemática", exact: true }).click();
  await page
    .getByText("Configurado × observado", { exact: true })
    .first()
    .waitFor({ state: "visible" });
  await page.locator("select").first().waitFor({ state: "visible" });
  await assertNoBlankScreen(page, "admin math audit");
  await assertNoHorizontalOverflow(page, "admin math audit");
  await page.screenshot({ path: `${artifactDir}/admin-math-audit-1440x900.png`, fullPage: true });

  const adminSections = [
    ["Visão Geral", "Operação de raspadinhas"],
    ["Raspadinhas", "Cadastros operacionais e versão publicada atual."],
    ["Versões Matemáticas", "Versões e resultados"],
    ["Resultados", "Resultados matemáticos"],
    ["Raridades", "Raridades"],
    ["Diária", "Configuração da Diária"],
    ["Misteriosa", "Pool e pesos"],
    ["Loja", "Itens da loja"],
    ["Resgates", "Resgates"],
    ["Conquistas", "Conquistas"],
    ["Usuários", "Usuários"],
    ["Ledger", "Ledger de créditos"],
    ["Auditoria", "Auditoria"],
    ["Simulador", "Simulador"],
  ];

  for (const [tabName, evidence] of adminSections) {
    await page.getByRole("tab", { name: tabName, exact: true }).click();
    await page.getByText(evidence, { exact: true }).first().waitFor({ state: "visible" });
    await assertNoBlankScreen(page, `admin ${tabName}`);
    await assertNoHorizontalOverflow(page, `admin ${tabName}`);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("tab", { name: "Raspadinhas", exact: true }).click();
  await page
    .getByText("Cadastros operacionais e versão publicada atual.", { exact: true })
    .first()
    .waitFor({ state: "visible" });
  await assertNoHorizontalOverflow(page, "admin mobile raspadinhas");
  await page.getByRole("tab", { name: "Resgates", exact: true }).click();
  await page.getByText("Resgates", { exact: true }).first().waitFor({ state: "visible" });
  await assertNoHorizontalOverflow(page, "admin mobile resgates");
  await page.screenshot({ path: `${artifactDir}/admin-mobile-390x844.png`, fullPage: true });

  const { error: demoteError } = await admin
    .from("profiles")
    .update({ is_admin: false })
    .eq("id", userId);
  if (demoteError) throw demoteError;
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
    assertRuntime("touch login");
    await page.getByRole("tab", { name: "Raspadinhas" }).click();
    const playButton = page.getByRole("button", { name: "Comprar e Jogar" }).first();
    await playButton.waitFor({ state: "visible" });
    await playButton.click();
    const canvas = page.getByRole("img", { name: /Área de raspagem/ });
    await canvas.waitFor({ state: "visible" });
    const box = await canvas.boundingBox();
    assert.ok(box, "scratch canvas has no bounding box");
    const revealButton = page.getByRole("button", { name: "Revelar resultado" });

    for (let y = 14; y < box.height - 8; y += 24) {
      for (let x = 14; x < box.width - 8; x += 24) {
        await page.touchscreen.tap(box.x + x, box.y + y);
      }
      await page.waitForTimeout(150);
      if (!(await revealButton.isVisible())) break;
    }

    await revealButton.waitFor({ state: "hidden", timeout: 10_000 });
    await page
      .getByRole("button", { name: "Jogar Novamente" })
      .waitFor({ state: "visible", timeout: 10_000 });
    assert.equal(
      await revealButton.isVisible(),
      false,
      "touch scratching did not reveal the result naturally",
    );
    await assertNoHorizontalOverflow(page, "touch scratch result");
    await page.screenshot({ path: `${artifactDir}/touch-scratch-390x844.png`, fullPage: true });
    assertRuntime("touch scratch interaction");
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

  const { data: authCheck, error: authCheckError } = await publicAuth.auth.signInWithPassword({
    email,
    password,
  });
  if (authCheckError)
    throw new Error(`Local publishable-key password sign-in failed: ${authCheckError.message}`);
  assert.equal(authCheck.user?.id, userId, "publishable-key auth returned the wrong local user");
  await publicAuth.auth.signOut();

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const assertRuntime = attachRuntimeGuards(page, "primary browser context");

    await exercisePublicViewports(page);
    assertRuntime("public viewports + transparency");
    await login(page, email, password);
    assertRuntime("login");
    await exerciseAuthenticatedViewports(page);
    assertRuntime("authenticated viewports");
    await exerciseScratchAndStore(page);
    assertRuntime("scratch + store + rewards");
    await exerciseProfile(page);
    assertRuntime("profile update + reload");
    await exerciseAdmin(page, userId);
    assertRuntime("admin operations + math audit");

    await page.getByRole("button", { name: "Sair" }).click();
    await page.waitForURL((url) => url.pathname === "/");
    try {
      await page.goto(`${baseUrl}/app`);
    } catch (error) {
      if (!String(error).includes("net::ERR_ABORTED")) throw error;
    }
    await page.waitForURL((url) => url.pathname === "/", { timeout: 10_000 });
    await page.getByRole("button", { name: "Entrar", exact: true }).waitFor({ state: "visible" });
    assertRuntime("logout + protected route redirect");

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
