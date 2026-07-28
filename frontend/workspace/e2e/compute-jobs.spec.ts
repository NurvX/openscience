import { expect, test } from "./fixtures"

test("runs a local compute job and follows its output from the right pane", async ({ page, gotoSession }) => {
  await gotoSession()

  await page.getByTitle("jobs").click()
  const pane = page.locator(".session-right-pane")
  await expect(pane.getByText("compute jobs", { exact: true })).toBeVisible()

  await pane.getByTitle("new job").click()
  await pane.getByLabel("Job name").fill("Playwright compute smoke")
  await pane.getByLabel("Command").fill("printf 'ui-compute-ok\\n'")
  await pane.getByRole("button", { name: "run job" }).click()

  await expect(pane.getByText("Playwright compute smoke", { exact: true }).first()).toBeVisible()
  await expect(pane.locator("pre")).toContainText("ui-compute-ok")
  await expect(pane.getByText(/This computer · succeeded/)).toBeVisible()
})
