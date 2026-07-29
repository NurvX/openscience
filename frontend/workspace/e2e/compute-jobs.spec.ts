import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { expect, test } from "./fixtures"

test("runs a reproducible local job and captures outputs from the right pane", async ({ page, gotoSession }) => {
  const directory = mkdtempSync(path.join(tmpdir(), "openscience-compute-e2e-"))
  try {
    await gotoSession()

    await page
      .getByRole("tab", { name: "Compute", exact: true })
      .or(page.getByRole("button", { name: "Compute", exact: true }))
      .first()
      .click()
    const pane = page.locator(".session-right-pane")
    await expect(pane.getByText("compute jobs", { exact: true })).toBeVisible()

    await pane.getByTitle("new job").click()
    await pane.getByLabel("Job name").fill("Playwright compute smoke")
    await pane.getByLabel("Working directory").fill(directory)
    await pane
      .getByLabel("Command")
      .fill(
        "mkdir -p outputs && printf 'metric,value\\nloss,0.1\\n' > outputs/ui-results.csv && printf 'ui-compute-ok\\n'",
      )
    await pane.getByRole("button", { name: "resources & reproducibility" }).click()
    await pane.getByLabel("CPU cores").fill("2")
    await pane.getByLabel("Memory in GB").fill("4")
    await pane.getByLabel("Artifact patterns").fill("outputs/**/*.csv")
    await pane.getByRole("button", { name: "run job" }).click()

    await expect(pane.getByText("Playwright compute smoke", { exact: true }).first()).toBeVisible()
    await expect(pane.locator("pre")).toContainText("ui-compute-ok")
    await expect(pane.getByText(/This computer · succeeded/)).toBeVisible()
    await expect(pane.getByText("captured outputs", { exact: true })).toBeVisible()
    await expect(pane.getByText("outputs/ui-results.csv", { exact: true })).toBeVisible()
    await expect(pane.getByText("reproducibility", { exact: true })).toBeVisible()
    await expect(pane.getByRole("button", { name: "export manifest" })).toBeVisible()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
