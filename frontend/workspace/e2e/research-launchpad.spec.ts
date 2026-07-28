import { expect, test } from "./fixtures"

test("turns a scientific workflow into an editable research brief", async ({ page, gotoSession }) => {
  await gotoSession()

  const launchpad = page.locator('[data-component="research-launchpad"]')
  await expect(launchpad).toBeVisible()
  await expect(launchpad.getByRole("heading", { name: "What are we trying to find out?" })).toBeVisible()
  await expect(launchpad.locator("[data-workflow]")).toHaveCount(8)
  await expect(launchpad.getByText("Research artifacts", { exact: true })).toBeVisible()
  await expect(page.locator(".session-right-pane")).toHaveCount(0)

  await launchpad.locator('[data-workflow="analyze-data"]').click()

  const composer = page.locator('[data-component="prompt-input"]')
  await expect(composer).toBeFocused()
  await expect(composer).toContainText("Analyze the relevant dataset in this project")
})
