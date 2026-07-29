import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Instance } from "../../src/project/instance"
import { FileRoutes } from "../../src/server/routes/file"
import { tmpdir } from "../fixture/fixture"

describe("/file research routes", () => {
  test("returns a project audit and downloadable integrity manifest", async () => {
    await using tmp = await tmpdir({
      init: async (directory) => {
        await Bun.write(path.join(directory, "results.csv"), "metric,value\naccuracy,0.9\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const audit = await FileRoutes().request("/file/reproducibility")
        expect(audit.status).toBe(200)
        expect(((await audit.json()) as { checks: unknown[] }).checks.length).toBeGreaterThan(5)

        const manifest = await FileRoutes().request("/file/manifest")
        expect(manifest.status).toBe(200)
        expect(manifest.headers.get("content-disposition")).toContain("openscience-artifact-manifest.json")
        expect(((await manifest.json()) as { artifacts: unknown[] }).artifacts).toHaveLength(1)
      },
    })
  })

  test("creates a starter project through the local file API", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const response = await FileRoutes().request("/file/starters", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ template: "protein-structure" }),
        })
        expect(response.status).toBe(200)
        const result = (await response.json()) as { notebook: string; files: string[] }
        expect(result.notebook).toBe("openscience-starters/protein-structure/analysis.ipynb")
        expect(result.files).toContain("openscience-starters/protein-structure/data/alanine.pdb")
      },
    })
  })

  test("exports a Markdown report through the publication API", async () => {
    await using tmp = await tmpdir({
      init: async (directory) => {
        await Bun.write(path.join(directory, "report.md"), "# Auditable result\n\nA concise result.\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const capabilities = await FileRoutes().request("/file/publication/capabilities")
        expect(capabilities.status).toBe(200)
        const support = (await capabilities.json()) as { formats: { html: boolean } }
        expect(support.formats.html).toBe(true)
        const response = await FileRoutes().request("/file/publication", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: "report.md", format: "html" }),
        })
        expect(response.status).toBe(200)
        expect(((await response.json()) as { path: string }).path).toMatch(/^exports\/report-.+\.html$/)
      },
    })
  })

  test("creates, resolves, and deletes durable artifact annotations", async () => {
    await using tmp = await tmpdir({
      init: async (directory) => {
        await Bun.write(path.join(directory, "results.csv"), "metric,value\naccuracy,0.9\n")
      },
    })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const created = await FileRoutes().request("/file/annotations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            path: "results.csv",
            body: "Verify this value against the held-out split.",
            anchor: { kind: "text", startLine: 2, endLine: 2, quote: "accuracy,0.9" },
          }),
        })
        expect(created.status).toBe(200)
        const note = (await created.json()) as { id: string; status: string; anchor: { kind: string } }
        expect(note.id).toStartWith("ann_")
        expect(note.status).toBe("open")
        expect(note.anchor.kind).toBe("text")

        const listed = await FileRoutes().request("/file/annotations?path=results.csv")
        expect(listed.status).toBe(200)
        expect((await listed.json()) as unknown[]).toHaveLength(1)

        const resolved = await FileRoutes().request(`/file/annotations/${note.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "resolved" }),
        })
        expect(resolved.status).toBe(200)
        expect(((await resolved.json()) as { status: string }).status).toBe("resolved")

        const removed = await FileRoutes().request(`/file/annotations/${note.id}`, { method: "DELETE" })
        expect(removed.status).toBe(200)
        expect(await removed.json()).toEqual({ deleted: true })
        expect(await (await FileRoutes().request("/file/annotations?path=results.csv")).json()).toEqual([])
      },
    })
  })
})
