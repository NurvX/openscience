import { test, expect } from "./fixtures"
import { openFilesSources } from "./utils"

test("session files source can descend folders and open a file", async ({ page, openSession }) => {
  await openSession()
  await openFilesSources(page)
  await page.getByRole("button", { name: "Open session files", exact: true }).click()

  for (const folder of ["frontend", "workspace"]) {
    await page.getByRole("listitem", { name: `Open folder ${folder}`, exact: true }).click()
  }
  const crumbs = page.getByLabel("Current folder").first()
  await expect(crumbs).toContainText("workspace")

  await page.getByRole("listitem", { name: "Open file package.json", exact: true }).click()
  await expect(page.locator('.inspector-tabs [role="tab"][title="frontend/workspace/package.json"]')).toHaveAttribute(
    "aria-selected",
    "true",
  )
  await expect(page.locator('[data-component="file-view"]')).toContainText("@synsci/workspace")
})
