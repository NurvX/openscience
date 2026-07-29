import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import z from "zod"
import { Instance } from "../../project/instance"
import { Provenance, type Edge, type Node } from "../../science/provenance/store"
import { Review } from "../../science/provenance/review"
import { lazy } from "../../util/lazy"

const Kind = z.enum(["artifact", "run", "source", "claim"])
const Relation = z.enum(["produced", "consumed", "derived-from", "supports", "refutes"])
const NodeInput = z.object({
  kind: Kind,
  label: z.string().trim().min(1).max(240),
  artifact_type: z.string().trim().min(1).max(120).optional(),
  path: z.string().max(4_000).optional(),
  content_hash: z.string().max(240).optional(),
  size: z.number().int().nonnegative().optional(),
  tool: z.string().trim().min(1).max(240).optional(),
  status: z.enum(["ok", "error"]).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  derived_from: z.string().optional(),
  relation: Relation.default("derived-from"),
})
const ReviewInput = z.object({
  target: z.string(),
  claim: z.string().trim().min(1).max(10_000),
  issue: z.string().trim().min(1).max(10_000),
  severity: z.enum(["blocking", "major", "minor", "info"]),
  evidence: z.string().trim().min(1).max(20_000),
  verdict: z.enum(["refutes", "supports"]).default("refutes"),
})

function summary(nodes: Node[], edges: Edge[]) {
  const kinds = { artifact: 0, run: 0, source: 0, claim: 0 }
  const reviews = { supports: 0, refutes: 0, blocking: 0, major: 0, minor: 0, info: 0 }
  for (const node of nodes) {
    kinds[node.kind] += 1
    if (node.meta?.review !== true) continue
    const verdict = node.meta.verdict
    const severity = node.meta.severity
    if (verdict === "supports" || verdict === "refutes") reviews[verdict] += 1
    if (severity === "blocking" || severity === "major" || severity === "minor" || severity === "info") {
      reviews[severity] += 1
    }
  }
  return {
    total: nodes.length,
    edges: edges.length,
    kinds,
    reviews,
    orphan_edges: edges.filter(
      (edge) => !nodes.some((node) => node.id === edge.from) || !nodes.some((node) => node.id === edge.to),
    ).length,
  }
}

function lineage(id: string, nodes: Node[], edges: Edge[]) {
  const ids = new Set([id])
  const queue = [id]
  while (queue.length) {
    const current = queue.shift()!
    for (const edge of edges) {
      if (edge.from !== current && edge.to !== current) continue
      const next = edge.from === current ? edge.to : edge.from
      if (ids.has(next)) continue
      ids.add(next)
      queue.push(next)
    }
  }
  return {
    nodes: nodes.filter((node) => ids.has(node.id)),
    edges: edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to)),
  }
}

export const ProvenanceRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "List the project provenance graph",
        description: "Returns project-scoped artifacts, runs, sources, claims, reviewer findings, and typed edges.",
        operationId: "provenance.list",
        responses: { 200: { description: "Project provenance graph" } },
      }),
      async (c) => {
        const graph = await Provenance.project(Instance.directory)
        return c.json({ ...graph, summary: summary(graph.nodes, graph.edges) })
      },
    )
    .post(
      "/nodes",
      describeRoute({
        summary: "Record a project provenance node",
        operationId: "provenance.record",
        responses: { 200: { description: "Recorded node" }, 400: { description: "Invalid link target" } },
      }),
      validator("json", NodeInput),
      async (c) => {
        const input = c.req.valid("json")
        const graph = input.derived_from ? await Provenance.project(Instance.directory) : undefined
        if (input.derived_from && !graph?.nodes.some((node) => node.id === input.derived_from)) {
          return c.json({ error: "The provenance link target was not found" }, 400)
        }
        const node = await Provenance.record({
          kind: input.kind,
          label: input.label,
          ...(input.artifact_type ? { artifactType: input.artifact_type } : {}),
          ...(input.path ? { path: input.path } : {}),
          ...(input.content_hash ? { contentHash: input.content_hash } : {}),
          ...(input.size !== undefined ? { size: input.size } : {}),
          ...(input.tool ? { tool: input.tool } : {}),
          ...(input.status ? { status: input.status } : {}),
          meta: { ...input.meta, directory: Instance.directory },
        } as Parameters<typeof Provenance.record>[0])
        if (input.derived_from) {
          await Provenance.link({ from: node.id, to: input.derived_from, relation: input.relation })
        }
        return c.json(node)
      },
    )
    .post(
      "/reviews",
      describeRoute({
        summary: "Record a reviewer finding",
        operationId: "provenance.review",
        responses: { 200: { description: "Recorded finding" }, 400: { description: "Invalid target" } },
      }),
      validator("json", ReviewInput),
      async (c) => {
        const input = c.req.valid("json")
        const graph = await Provenance.project(Instance.directory)
        if (!graph.nodes.some((node) => node.id === input.target)) {
          return c.json({ error: "The review target was not found" }, 400)
        }
        const result = await Review.record({
          target: input.target,
          finding: {
            claim: input.claim,
            issue: input.issue,
            severity: input.severity,
            evidence: input.evidence,
          },
          verdict: input.verdict,
          reviewer: "manual review",
          directory: Instance.directory,
        })
        return c.json(result)
      },
    )
    .get(
      "/export",
      describeRoute({
        summary: "Export a project provenance audit",
        operationId: "provenance.export",
        responses: { 200: { description: "Portable JSON audit packet" } },
      }),
      async (c) => {
        const graph = await Provenance.project(Instance.directory)
        c.header("Content-Disposition", 'attachment; filename="openscience-provenance-audit.json"')
        return c.json({
          format: "openscience.provenance.audit.v1",
          generated_at: new Date().toISOString(),
          project: Instance.directory,
          summary: summary(graph.nodes, graph.edges),
          ...graph,
        })
      },
    )
    .get(
      "/:id",
      describeRoute({
        summary: "Trace a provenance node",
        operationId: "provenance.trace",
        responses: { 200: { description: "Connected lineage" }, 404: { description: "Node not found" } },
      }),
      validator("param", z.object({ id: z.string() })),
      async (c) => {
        const graph = await Provenance.project(Instance.directory)
        const id = c.req.valid("param").id
        if (!graph.nodes.some((node) => node.id === id)) return c.json({ error: "Provenance node not found" }, 404)
        const connected = lineage(id, graph.nodes, graph.edges)
        return c.json({ ...connected, summary: summary(connected.nodes, connected.edges) })
      },
    ),
)
