import { test, expect } from "./fixtures"
import { createSdk } from "./utils"

test("home project search filters the recent list and clears back to it", async ({ page, directory }) => {
  const current = await createSdk(directory)
    .project.current()
    .then((result) => result.data)
  if (!current?.id) throw new Error("Failed to resolve the current project id")

  await page.goto("/")
  const card = page.locator(`[data-project="${current.id}"]`)
  await expect(card).toBeVisible()

  const search = page.getByRole("searchbox", { name: "Search projects" })
  await search.fill("definitely-not-a-project")
  await expect(page.getByText("No matching projects", { exact: true })).toBeVisible()
  await expect(card).toHaveCount(0)

  // Clearing from either the search field or the no-results recovery restores the list.
  await page.getByRole("button", { name: "Clear search", exact: true }).first().click()
  await expect(card).toBeVisible()
})

test("new projects expose existing source folders in the create flow", async ({ page }) => {
  await page.goto("/")
  await page.getByRole("button", { name: "New project", exact: true }).click()

  const create = page.getByRole("dialog")
  await expect(create.getByRole("heading", { name: "Create project", exact: true })).toBeVisible()
  await expect(create.getByRole("button", { name: /Add source folders/ })).toBeVisible()
  await expect(page.getByRole("button", { name: "Import existing folder", exact: true })).toHaveCount(0)
  await create.getByRole("button", { name: "Cancel", exact: true }).click()
  await expect(create).toHaveCount(0)
})
