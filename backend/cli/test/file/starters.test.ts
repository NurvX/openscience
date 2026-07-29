import { describe, expect, test } from "bun:test"
import path from "node:path"
import { StarterFile } from "../../src/file/starters"
import { tmpdir } from "../fixture/fixture"

describe("StarterFile", () => {
  test.each(["single-cell", "dose-response", "protein-structure"] as const)(
    "creates a complete %s starter without external downloads",
    async (template) => {
      await using tmp = await tmpdir()
      const created = await StarterFile.create(tmp.path, template)
      expect(created.template).toBe(template)
      expect(created.files.length).toBeGreaterThanOrEqual(3)
      expect(created.notebook).toEndWith(".ipynb")
      const notebook = await Bun.file(path.join(tmp.path, created.notebook)).json()
      expect(notebook.nbformat).toBe(4)
      expect(notebook.cells.some((cell: { cell_type?: string }) => cell.cell_type === "code")).toBe(true)
      expect(await Bun.file(path.join(tmp.path, created.readme)).exists()).toBe(true)
    },
  )

  test("refuses to overwrite an existing starter", async () => {
    await using tmp = await tmpdir()
    await StarterFile.create(tmp.path, "single-cell")
    await expect(StarterFile.create(tmp.path, "single-cell")).rejects.toThrow("already exists")
  })
})
