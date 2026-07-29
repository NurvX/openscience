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
  const file = page.getByRole("button", { name: new RegExp(`^${escapeRegex(filename)}\\b`) }).first()
  await expect(file).toBeVisible()
  await file.click()
}

test("authors Markdown with live preview, local citations, and local figures", async ({
  page,
  directory,
  gotoSession,
}) => {
  await gotoSession()
  await openFile(page, directory, "frontend/workspace/e2e/science/manuscript.md")

  const workbench = page.locator('[data-component="manuscript-workbench"]')
  const editor = workbench.getByLabel("Manuscript source")
  const preview = workbench.locator('[data-slot="manuscript-preview"]')
  await expect(workbench).toBeVisible()
  await expect(editor).toBeVisible()
  await expect(preview.getByRole("heading", { name: "Manuscript workbench", exact: true })).toBeVisible()
  await expect(preview).not.toContainText("bibliography: references.bib")

  await editor.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(node.value.length, node.value.length))
  await workbench.getByRole("button", { name: "Citations", exact: true }).click()
  const citations = workbench.locator('[data-component="citation-browser"]')
  await expect(citations.getByText("Reliable Scientific Interfaces", { exact: true })).toBeVisible()
  await citations.getByPlaceholder("Find by author, title, or key…").fill("smith")
  await citations.getByRole("button", { name: "Insert @smith2026", exact: true }).click()
  await expect(editor).toHaveValue(/\[@smith2026\]$/)

  await workbench.getByRole("button", { name: "Figures", exact: true }).click()
  const figures = workbench.locator('[data-component="figure-browser"]')
  await figures.getByPlaceholder("Find a local figure…").fill("manuscript-figure")
  await figures.getByLabel("Figure alt text").fill("Primary endpoint")
  await figures.getByRole("button", { name: "Insert manuscript-figure.svg", exact: true }).click()
  await expect(editor).toHaveValue(/!\[Primary endpoint\]\(manuscript-figure\.svg\)$/)
  await expect(preview.getByRole("img", { name: "Primary endpoint", exact: true })).toBeVisible()

  await page.getByRole("button", { name: "reset", exact: true }).click()
  await expect(editor).not.toHaveValue(/\[@smith2026\]/)
})

test("exposes exact-byte review and publication export controls", async ({ page, directory, gotoSession }) => {
  const exports: Array<Record<string, unknown>> = []
  await page.route("**/file/publication?**", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue()
      return
    }
    exports.push(route.request().postDataJSON() as Record<string, unknown>)
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        path: "exports/manuscript-preview.html",
        format: "html",
        size: 512,
        created_at: new Date().toISOString(),
        engine: "OpenScience Markdown",
        readiness: "draft",
      }),
    })
  })

  await gotoSession()
  await openFile(page, directory, "frontend/workspace/e2e/science/manuscript.md")
  const workbench = page.locator('[data-component="manuscript-workbench"]')

  await workbench.getByRole("button", { name: "Review", exact: true }).click()
  const inspector = page.locator('[data-component="artifact-inspector"]')
  await expect(inspector.getByRole("tab", { name: "Review", exact: true })).toHaveAttribute("aria-selected", "true")

  await workbench.getByRole("button", { name: "Publish", exact: true }).click()
  const publish = workbench.locator('[data-component="publication-controls"]')
  await expect(publish.getByText("Reviewed export locked", { exact: true })).toBeVisible()
  await publish.getByRole("button", { name: "Export draft HTML", exact: true }).click()
  await expect
    .poll(() => exports)
    .toEqual([
      {
        path: "manuscript.md",
        format: "html",
        readiness: "draft",
      },
    ])
})
