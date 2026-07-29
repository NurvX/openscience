import path from "node:path"
import type { Page } from "@playwright/test"
import { test, expect } from "./fixtures"

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

async function openFile(page: Page, directory: string, relativePath: string) {
  await page.getByRole("tab", { name: "Files", exact: true }).click()
  const folder = path.join(directory, path.dirname(relativePath))
  const filename = path.basename(relativePath)
  const location = page.getByPlaceholder("/absolute/path")
  await location.fill(folder)
  await location.press("Enter")
  await page.getByPlaceholder("filter this folder…").fill(filename)
  await page.getByRole("button", { name: new RegExp(`^${escapeRegex(filename)}\\b`) }).first().click()
  await expect(page.locator(`[role="tab"][title="${filename}"]`)).toHaveAttribute("aria-selected", "true")
}

test("opened files drive a contextual artifact inspector without stale state", async ({
  page,
  directory,
  gotoSession,
}) => {
  await gotoSession()
  await openFile(page, directory, "frontend/workspace/e2e/science/water.xyz")

  const inspector = page.locator('[data-component="artifact-inspector"]')
  await expect(inspector).toBeVisible()
  await expect(inspector).toHaveAttribute("data-artifact-id", /water\.xyz/)
  await expect(inspector.locator("header strong")).toHaveText("water.xyz")
  await expect(inspector.getByRole("tab")).toHaveCount(7)

  const details = inspector.getByRole("tab", { name: "Details", exact: true })
  await details.focus()
  await details.press("ArrowRight")
  await expect(inspector.getByRole("tab", { name: "Code", exact: true })).toHaveAttribute("aria-selected", "true")
  await expect(inspector.locator("pre")).toContainText("water")

  await inspector.getByRole("tab", { name: "Run", exact: true }).click()
  await expect(inspector.getByText("No generating run is recorded", { exact: true })).toBeVisible()

  await openFile(page, directory, "frontend/workspace/e2e/science/alignment.fasta")
  await expect(inspector).toHaveAttribute("data-artifact-id", /alignment\.fasta/)
  await expect(inspector.locator("header strong")).toHaveText("alignment.fasta")
  await expect(inspector.getByRole("tab", { name: "Details", exact: true })).toHaveAttribute("aria-selected", "true")

  await page.getByRole("tab", { name: "Chat", exact: true }).click()
  await expect(inspector).toHaveCount(0)
  await expect(page.locator(".session-right-pane").getByRole("tab", { name: "Atlas", exact: true })).toBeVisible()
})

test("artifact inspector overlays rather than crushing the workbench at narrow desktop widths", async ({
  page,
  directory,
  gotoSession,
}) => {
  await page.setViewportSize({ width: 1024, height: 760 })
  await gotoSession()
  await openFile(page, directory, "frontend/workspace/e2e/science/water.xyz")

  const inspector = page.locator('[data-component="artifact-inspector"]')
  const file = page.locator('[data-component="file-view"]')
  await expect(inspector).toBeVisible()
  await expect(file).toBeVisible()
  const [inspectorBox, fileBox] = await Promise.all([inspector.boundingBox(), file.boundingBox()])
  expect(inspectorBox?.width).toBeGreaterThanOrEqual(280)
  expect(fileBox?.width).toBeGreaterThanOrEqual(520)
  expect(inspectorBox?.x).toBeGreaterThan(fileBox?.x ?? 0)
})
