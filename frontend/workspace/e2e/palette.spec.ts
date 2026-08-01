import { test, expect } from "./fixtures"
test("search palette opens and closes", async ({ page, gotoSession }) => {
  await gotoSession()

  await page.getByRole("button", { name: "Search and commands", exact: true }).click()

  const dialog = page.getByRole("dialog", { name: "command palette" })
  const search = dialog.getByRole("textbox", { name: "search projects, sessions, messages, and artifacts" })
  await expect(dialog).toBeVisible()
  await expect(search).toBeVisible()
  await expect(dialog.getByRole("button", { name: /Settings/ })).toBeVisible()

  await page.keyboard.press("Escape")
  await expect(search).toHaveCount(0)
})
