import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test, expect } from "./fixtures"

test("discovers, filters, opens, downloads, and contextualizes local research artifacts", async ({
  page,
  gotoSession,
}) => {
  await page.route("**/file/publication/capabilities?**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        pandoc: false,
        formats: { html: true, pdf: false, docx: false, latex: false, pptx: false },
      }),
    }),
  )
  const directory = mkdtempSync(path.join(tmpdir(), "openscience-artifacts-e2e-"))
  mkdirSync(path.join(directory, "results"))
  writeFileSync(path.join(directory, "analysis.ipynb"), '{"cells":[],"metadata":{},"nbformat":4,"nbformat_minor":5}')
  writeFileSync(path.join(directory, "results", "counts.csv"), "gene,count\nTP53,12\nEGFR,4\n")
  writeFileSync(
    path.join(directory, "results", "plot.svg"),
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle cx="5" cy="5" r="4"/></svg>',
  )
  writeFileSync(path.join(directory, "report.md"), "# Result\n\nThe result is reproducible.\n")
  writeFileSync(path.join(directory, "pipeline.py"), "print('source, not artifact')")

  try {
    await gotoSession()
    await page.getByRole("tab", { name: "Files", exact: true }).click()
    const location = page.getByPlaceholder("/absolute/path")
    await location.fill(directory)
    await location.press("Enter")
    await page.getByRole("button", { name: "artifacts", exact: true }).click()

    const gallery = page.locator('[data-component="artifact-gallery"]')
    await expect(gallery).toBeVisible()
    await expect(gallery.getByText("4 discovered locally", { exact: true })).toBeVisible()
    await expect(gallery.locator("[data-artifact]")).toHaveCount(4)
    await expect(gallery.getByText("pipeline.py", { exact: true })).toHaveCount(0)
    await expect(gallery.locator('[data-component="reproducibility-score"]')).toHaveAttribute("data-status", "blocked")

    await gallery.getByRole("button", { name: /^figure 1$/ }).click()
    await expect(gallery.locator("[data-artifact]")).toHaveCount(1)
    await expect(gallery.locator('[data-artifact="results/plot.svg"]')).toBeVisible()
    await expect(gallery.locator('[data-artifact="results/plot.svg"] img')).toBeVisible()

    await gallery.getByRole("button", { name: /^dataset 1$/ }).click()
    await gallery.locator('[data-artifact="results/counts.csv"]').click()
    const detail = gallery.locator('[data-component="artifact-detail"]')
    await expect(detail).toBeVisible()
    await expect(detail.getByText("results/counts.csv", { exact: true })).toBeVisible()
    await expect(detail.getByText("local file · no Git provenance", { exact: true })).toBeVisible()
    await expect(detail.getByRole("button", { name: /Inspect quality/ })).toBeVisible()
    await expect(detail.getByRole("button", { name: /Visualize/ })).toBeVisible()

    await detail.getByRole("button", { name: "add to context", exact: true }).click()
    await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveAttribute("aria-selected", "true")
    await expect(page.locator("form").getByText("counts.csv", { exact: true })).toBeVisible()

    await page.getByRole("tab", { name: "Files", exact: true }).click()
    await page.getByRole("button", { name: "artifacts", exact: true }).click()
    await gallery.getByRole("button", { name: /^dataset 1$/ }).click()
    await gallery.locator('[data-artifact="results/counts.csv"]').click()
    await detail.getByRole("button", { name: /Inspect quality/ }).click()
    await expect(page.locator('[data-component="prompt-input"]')).toContainText(
      "Inspect this dataset's schema and quality",
    )

    await page.getByRole("tab", { name: "Files", exact: true }).click()
    await page.getByRole("button", { name: "artifacts", exact: true }).click()
    await gallery.getByRole("button", { name: /^dataset 1$/ }).click()
    await gallery.locator('[data-artifact="results/counts.csv"]').click()
    await detail.getByRole("button", { name: "open", exact: true }).click()
    await expect(page.locator('[data-component="data-table"]')).toBeVisible()
    await expect(page.getByText("2 rows", { exact: true })).toBeVisible()

    await page.getByRole("tab", { name: "Files", exact: true }).click()
    await page.getByRole("button", { name: "artifacts", exact: true }).click()
    await gallery.getByRole("button", { name: /^report 1$/ }).click()
    await gallery.locator('[data-artifact="report.md"]').click()
    await expect(detail.getByText("Publication exports", { exact: true })).toBeVisible()
    await expect(detail.getByRole("button", { name: "HTML", exact: true })).toBeEnabled()
    await expect(detail.getByText("Install Pandoc to unlock PDF, Word, LaTeX, and PowerPoint.")).toBeVisible()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
