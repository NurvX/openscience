import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test, expect } from "./fixtures"

test("opens, executes, edits, and saves a native Jupyter notebook", async ({ page, gotoSession }) => {
  const directory = mkdtempSync(path.join(tmpdir(), "openscience-notebook-e2e-"))
  const filename = "analysis.ipynb"
  const filepath = path.join(directory, filename)
  writeFileSync(
    filepath,
    JSON.stringify(
      {
        cells: [
          { cell_type: "markdown", id: "intro", metadata: {}, source: ["# Experiment\n", "Persistent kernel"] },
          {
            cell_type: "code",
            id: "setup",
            metadata: {},
            source: ["value = 41"],
            execution_count: null,
            outputs: [],
          },
          {
            cell_type: "code",
            id: "result",
            metadata: {},
            source: ["value + 1"],
            execution_count: null,
            outputs: [],
          },
        ],
        metadata: { kernelspec: { display_name: "Python 3", language: "python", name: "python3" } },
        nbformat: 4,
        nbformat_minor: 5,
      },
      null,
      2,
    ),
  )

  try {
    await gotoSession()
    await page.getByRole("tab", { name: "Files", exact: true }).click()
    const location = page.getByPlaceholder("/absolute/path")
    await location.fill(directory)
    await location.press("Enter")
    await page.getByPlaceholder("filter this folder…").fill(filename)
    await page.getByRole("button", { name: new RegExp(`^${filename}\\b`) }).click()

    const notebook = page.locator('[data-component="notebook"]')
    await expect(notebook).toBeVisible()
    await expect(notebook.getByText("Experiment", { exact: true })).toBeVisible()
    await expect(notebook.locator('[data-cell-type="code"]')).toHaveCount(2)

    await notebook.locator('[data-action="run-all"]').click()
    await expect(notebook.getByText("42", { exact: true })).toBeVisible({ timeout: 20_000 })
    await expect(notebook.getByLabel("Kernel ready")).toBeVisible()

    const result = notebook.getByLabel("code cell 3")
    await result.fill("value + 2")
    await notebook.locator('[data-cell-id="result"] [data-action="run-cell"]').click()
    await expect(notebook.getByText("43", { exact: true })).toBeVisible()

    await page.getByRole("button", { name: "save", exact: true }).click()
    await expect.poll(() => JSON.parse(readFileSync(filepath, "utf8")).cells[2].source).toEqual(["value + 2"])
    await expect
      .poll(() => JSON.parse(readFileSync(filepath, "utf8")).cells[2].outputs[0].data["text/plain"])
      .toBe("43")
    await expect
      .poll(() => JSON.parse(readFileSync(filepath, "utf8")).cells[2].metadata.openscience.provenance_id)
      .toMatch(/^[a-f0-9]{16}$/)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
