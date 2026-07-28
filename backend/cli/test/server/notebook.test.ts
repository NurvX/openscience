import { describe, expect, test } from "bun:test"
import { NotebookRoutes } from "../../src/server/routes/notebook"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"
import { Provenance } from "../../src/science/provenance/store"

describe("/notebook routes", () => {
  test("executes cells in a persistent project-scoped Python kernel", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = NotebookRoutes()
        const first = await app.request("/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: "analysis.ipynb", language: "python", code: "value = 41" }),
        })
        expect(first.status).toBe(200)

        const second = await app.request("/execute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: "analysis.ipynb", language: "python", code: "value + 1" }),
        })
        const result = (await second.json()) as {
          ok: boolean
          provenance_id: string
          execution_count: number
          outputs: Array<{
            output_type: string
            data?: Record<string, string>
            execution_count?: number
            metadata?: object
          }>
        }

        expect(second.status).toBe(200)
        expect(result.ok).toBe(true)
        expect(result.provenance_id).toMatch(/^[a-f0-9]{16}$/)
        expect(result.execution_count).toBe(2)
        expect(result.outputs).toContainEqual({
          output_type: "execute_result",
          execution_count: 2,
          data: { "text/plain": "42" },
          metadata: {},
        })
        expect(await Provenance.get(result.provenance_id)).toMatchObject({
          kind: "run",
          tool: "notebook",
          status: "ok",
          inputs: {
            path: "analysis.ipynb",
            language: "python",
            code: "value + 1",
          },
        })

        const status = await app.request("/status?id=analysis.ipynb&language=python")
        expect(await status.json()).toEqual({ active: true, language: "python" })

        const restart = await app.request("/restart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: "analysis.ipynb", language: "python" }),
        })
        expect(await restart.json()).toEqual({ active: false, language: "python" })
      },
    })
  }, 30_000)

  test("validates notebook execution input", async () => {
    const response = await NotebookRoutes().request("/execute", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: "", language: "julia", code: "" }),
    })

    expect(response.status).toBe(400)
  })
})
