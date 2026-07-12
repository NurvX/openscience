import { test, expect } from "./fixtures"

test("terminal panel can be collapsed and reopened", async ({ page, gotoSession }) => {
  await gotoSession()

  const terminalTab = page.getByRole("tab", { name: "terminal", exact: true })
  await expect(terminalTab).toBeVisible()
  await terminalTab.click()
  await expect(terminalTab).toHaveAttribute("aria-selected", "true")

  await page.getByTitle("hide panel", { exact: true }).click()
  await expect(terminalTab).toHaveCount(0)

  await page.getByRole("button", { name: "terminal", exact: true }).click()
  await expect(terminalTab).toBeVisible()
  await expect(terminalTab).toHaveAttribute("aria-selected", "true")
})
