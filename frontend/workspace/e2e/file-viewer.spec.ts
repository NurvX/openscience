import { test, expect } from "./fixtures"
import { openFilesSources, openWorkspaceFile } from "./utils"

test("smoke file viewer renders real file content", async ({ page, openSession }) => {
  await openSession()

  await openFilesSources(page)
  await expect(page.getByRole("button", { name: "Open session files", exact: true })).toBeEnabled()
  await expect(page.getByRole("button", { name: "Connect another location", exact: true })).toBeVisible()

  await openWorkspaceFile(page, "package.json")
  await expect(page.getByText("@synsci/monorepo")).toBeVisible()
})
