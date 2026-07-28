import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { test, expect } from "./fixtures"

test("inspects and streams scientific binary containers", async ({ page, gotoSession }) => {
  const directory = mkdtempSync(path.join(tmpdir(), "openscience-binary-e2e-"))
  writeFileSync(
    path.join(directory, "cells.h5ad"),
    Uint8Array.from([0x89, 0x48, 0x44, 0x46, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]),
  )
  writeFileSync(path.join(directory, "sample.cram"), Uint8Array.from([0x43, 0x52, 0x41, 0x4d, 3, 1, 0, 0]))
  writeFileSync(path.join(directory, "sample.cram.crai"), "index")

  try {
    await gotoSession()
    await page.getByRole("tab", { name: "Files", exact: true }).click()
    const location = page.getByPlaceholder("/absolute/path")
    await location.fill(directory)
    await location.press("Enter")

    await page.getByPlaceholder("filter this folder…").fill("cells.h5ad")
    await page.getByRole("button", { name: /^cells\.h5ad\b/ }).click()
    const h5ad = page.locator('[data-component="binary-science"][data-format="h5ad"]')
    await expect(h5ad).toBeVisible()
    await expect(h5ad.getByText("signature valid", { exact: true })).toBeVisible()
    await expect(h5ad.getByText("H5AD container detected", { exact: true })).toBeVisible()
    await expect(h5ad.getByText("python -m pip install h5py anndata", { exact: true })).toBeVisible()

    const download = page.waitForEvent("download")
    await page.getByRole("button", { name: "download", exact: true }).click()
    expect((await download).suggestedFilename()).toBe("cells.h5ad")

    await page.getByRole("tab", { name: "Files", exact: true }).click()
    await page.getByPlaceholder("filter this folder…").fill("sample.cram")
    await page.locator('button[title$="/sample.cram"]').click()
    const cram = page.locator('[data-component="binary-science"][data-format="cram"]')
    await expect(cram).toBeVisible()
    await expect(cram.getByText("sample.cram.crai", { exact: true })).toBeVisible()
    await expect(cram.getByText("CRAM container detected", { exact: true })).toBeVisible()
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
