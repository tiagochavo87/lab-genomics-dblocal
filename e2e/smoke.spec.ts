import { test, expect } from "@playwright/test";

const email = process.env.E2E_EMAIL;
const password = process.env.E2E_PASSWORD;

test("página de login carrega sem erros de console", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.goto("/login");
  await expect(page.locator("input[type=email]").first()).toBeVisible();
  expect(errors, errors.join("\n")).toEqual([]);
});

test("login do administrador e navegação principal", async ({ page }) => {
  test.skip(!email || !password, "defina E2E_EMAIL e E2E_PASSWORD");
  await page.goto("/login");
  await page.locator("input[type=email]").first().fill(email!);
  await page.locator("input[type=password]").first().fill(password!);
  await page.locator("button[type=submit]").first().click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Explorar Dados")).toBeVisible();

  for (const [path, text] of [
    ["/diseases", "Banco"],
    ["/versions", "Versões e Cópias de Segurança"],
    ["/settings", "Segurança da conta"],
    ["/admin", "Log de Atividades"],
    ["/privacy", "Política de Privacidade"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByText(text).first()).toBeVisible();
  }
});
