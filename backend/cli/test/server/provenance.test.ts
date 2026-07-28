import { describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { ProvenanceRoutes } from "../../src/server/routes/provenance"
import { tmpdir } from "../fixture/fixture"

describe("/provenance routes", () => {
  test("records, reviews, scopes, traces, and exports a project audit graph", async () => {
    await using tmp = await tmpdir({ git: true })
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const app = ProvenanceRoutes()
        const source = await app.request("/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "source",
            label: "Trial registry record",
            meta: { doi: "10.1000/example" },
          }),
        })
        expect(source.status).toBe(200)
        const sourceNode = (await source.json()) as { id: string }

        const claim = await app.request("/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "claim",
            label: "Treatment improves response",
            derived_from: sourceNode.id,
          }),
        })
        expect(claim.status).toBe(200)
        const claimNode = (await claim.json()) as { id: string }

        const review = await app.request("/reviews", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            target: claimNode.id,
            claim: "Treatment improves response",
            issue: "verified",
            severity: "info",
            evidence: sourceNode.id,
            verdict: "supports",
          }),
        })
        expect(review.status).toBe(200)

        const graph = await app.request("/")
        const result = (await graph.json()) as {
          nodes: Array<{ id: string; kind: string }>
          edges: Array<{ from: string; to: string; relation: string }>
          summary: {
            total: number
            edges: number
            kinds: Record<string, number>
            reviews: Record<string, number>
          }
        }
        expect(result.summary).toMatchObject({
          total: 3,
          edges: 2,
          kinds: { source: 1, claim: 2 },
          reviews: { supports: 1, refutes: 0 },
        })
        expect(result.edges).toContainEqual({
          from: claimNode.id,
          to: sourceNode.id,
          relation: "derived-from",
        })

        const lineage = await app.request(`/${claimNode.id}`)
        expect(lineage.status).toBe(200)
        expect(((await lineage.json()) as { nodes: unknown[] }).nodes).toHaveLength(3)

        const audit = await app.request("/export")
        expect(audit.status).toBe(200)
        expect(audit.headers.get("content-disposition")).toContain("openscience-provenance-audit.json")
        expect(((await audit.json()) as { project: string }).project).toBe(tmp.path)
      },
    })
  })

  test("rejects links to missing nodes", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const response = await ProvenanceRoutes().request("/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "claim",
            label: "Unsupported claim",
            derived_from: "missing-node",
          }),
        })
        expect(response.status).toBe(400)
      },
    })
  })

  test("does not expose or link provenance across project boundaries", async () => {
    await using first = await tmpdir()
    await using second = await tmpdir()
    const source = await Instance.provide({
      directory: first.path,
      fn: async () => {
        const response = await ProvenanceRoutes().request("/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "source", label: "Private first-project source" }),
        })
        return (await response.json()) as { id: string }
      },
    })

    await Instance.provide({
      directory: second.path,
      fn: async () => {
        const graph = await ProvenanceRoutes().request("/")
        expect(((await graph.json()) as { nodes: unknown[] }).nodes).toHaveLength(0)

        const link = await ProvenanceRoutes().request("/nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            kind: "claim",
            label: "Cross-project claim",
            derived_from: source.id,
          }),
        })
        expect(link.status).toBe(400)
      },
    })
  })
})
