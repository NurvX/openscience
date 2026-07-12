import { test, expect } from "./fixtures"
import { modKey } from "./utils"

test("search palette opens and closes", async ({ page, gotoSession }) => {
  await gotoSession()

  await page.keyboard.press(`${modKey}+K`)

  const search = page.getByPlaceholder("search projects, sessions, actions…")
  await expect(search).toBeVisible()
  await expect(page.getByRole("button", { name: /Settings/ })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(search).toHaveCount(0)
})
