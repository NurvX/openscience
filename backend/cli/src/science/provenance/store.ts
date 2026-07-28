/**
 * Local, content-addressed provenance DAG.
 *
 * Records the lineage of a scientific investigation: which artifacts (files,
 * datasets, figures) were produced by which runs (tool/kernel executions),
 * from which inputs. Nodes are content-addressed (id = sha256 of canonical
 * payload) so identical content dedupes and lineage is verifiable.
 *
 * Persistence: a single JSON file under the app data dir. Small-scale by design
 * — this is a research notebook's audit trail, not a production graph DB.
 */
import path from "path"
import { Global } from "@/global"

export type NodeKind = "artifact" | "run" | "source" | "claim"

/** Base fields shared by every node. */
export interface NodeBase {
  /** Content-addressed id (sha256 hex, 16-char prefix) unless caller supplies one. */
  id: string
  kind: NodeKind
  /** Human label. */
  label: string
  /** ISO timestamp the node was recorded. */
  recordedAt: string
  /** Arbitrary structured metadata. */
  meta?: Record<string, unknown>
}

/** A produced/consumed data artifact (file, dataset, figure, model, ...). */
export interface Artifact extends NodeBase {
  kind: "artifact"
  /** Artifact type discriminator, e.g. "dataset" | "figure" | "model" | "report". */
  artifactType: string
  /** On-disk path if materialized. */
  path?: string
  /** Content hash of the artifact bytes (may differ from node id). */
  contentHash?: string
  /** Byte size if known. */
  size?: number
}

/** A run: a tool/kernel/agent execution that consumes inputs and emits outputs. */
export interface Run extends NodeBase {
  kind: "run"
  /** Tool/kernel/command that executed, e.g. "notebook", "science_search". */
  tool: string
  /** Session this run belongs to. */
  sessionID?: string
  /** Serialized inputs (params) for reproducibility. */
  inputs?: Record<string, unknown>
  /** Exit status. */
  status?: "ok" | "error"
}

export type Node = Artifact | Run | NodeBase

export type EdgeRelation = "produced" | "consumed" | "derived-from" | "supports" | "refutes"

/** A directed, typed edge between two nodes. */
export interface Edge {
  from: string
  to: string
  relation: EdgeRelation
  meta?: Record<string, unknown>
}

interface Graph {
  version: 1
  nodes: Record<string, Node>
  edges: Edge[]
}

const STORE_PATH = path.join(Global.Path.data, "provenance", "graph.json")
const lock = { current: Promise.resolve() as Promise<unknown> }

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")
}

/** Deterministic content id from a node's identifying payload. */
export async function contentId(payload: unknown): Promise<string> {
  const canonical = JSON.stringify(stable(payload))
  return (await sha256(canonical)).slice(0, 16)
}

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, stable(item)]),
  )
}

async function load(): Promise<Graph> {
  const file = Bun.file(STORE_PATH)
  if (!(await file.exists())) return { version: 1, nodes: {}, edges: [] }
  try {
    return (await file.json()) as Graph
  } catch {
    return { version: 1, nodes: {}, edges: [] }
  }
}

async function save(graph: Graph): Promise<void> {
  await Bun.write(STORE_PATH, JSON.stringify(graph, null, 2))
}

async function mutate<T>(fn: (graph: Graph) => Promise<T> | T): Promise<T> {
  const task = lock.current
    .catch(() => undefined)
    .then(async () => {
      const graph = await load()
      const result = await fn(graph)
      await save(graph)
      return result
    })
  lock.current = task
  return task
}

function belongs(node: Node, directory: string): boolean {
  const root = path.resolve(directory)
  const nodeDirectory = node.meta?.directory
  if (typeof nodeDirectory === "string" && path.resolve(nodeDirectory) === root) return true
  if (node.kind !== "artifact" || !("path" in node) || !node.path || !path.isAbsolute(node.path)) return false
  const relative = path.relative(root, path.resolve(node.path))
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative))
}

export namespace Provenance {
  /** Record a node. If `id` is omitted it is content-addressed from the node body. */
  export async function record(node: Omit<Node, "id" | "recordedAt"> & { id?: string }): Promise<Node> {
    return mutate(async (graph) => {
      const recordedAt = new Date().toISOString()
      const id = node.id ?? (await contentId({ ...node }))
      const full = { ...node, id, recordedAt } as Node
      graph.nodes[id] = full
      return full
    })
  }

  /** Link two existing nodes with a typed edge. */
  export async function link(edge: Edge): Promise<Edge> {
    return mutate((graph) => {
      if (!graph.nodes[edge.from]) throw new Error(`Provenance node ${edge.from} was not found`)
      if (!graph.nodes[edge.to]) throw new Error(`Provenance node ${edge.to} was not found`)
      const exists = graph.edges.some((e) => e.from === edge.from && e.to === edge.to && e.relation === edge.relation)
      if (!exists) graph.edges.push(edge)
      return edge
    })
  }

  /** Fetch a single node by id. */
  export async function get(id: string): Promise<Node | undefined> {
    const graph = await load()
    return graph.nodes[id]
  }

  /**
   * Query lineage. Without `id`, returns the whole graph. With `id`, returns the
   * node plus its ancestry tree (transitive `consumed` / `derived-from` inputs).
   */
  export async function query(id?: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const graph = await load()
    if (!id) return { nodes: Object.values(graph.nodes), edges: graph.edges }

    const seen = new Set<string>()
    const stack = [id]
    const edges: Edge[] = []
    while (stack.length) {
      const cur = stack.pop()!
      if (seen.has(cur)) continue
      seen.add(cur)
      for (const e of graph.edges) {
        if (e.to === cur || e.from === cur) {
          edges.push(e)
          const next = e.to === cur ? e.from : e.to
          if (!seen.has(next)) stack.push(next)
        }
      }
    }
    return {
      nodes: [...seen].map((n) => graph.nodes[n]).filter((n): n is Node => Boolean(n)),
      edges,
    }
  }

  /** List all recorded nodes. */
  export async function list(): Promise<Node[]> {
    const graph = await load()
    return Object.values(graph.nodes)
  }

  /** Return only nodes belonging to a project plus their directly or transitively linked evidence. */
  export async function project(directory: string): Promise<{ nodes: Node[]; edges: Edge[] }> {
    const graph = await load()
    const seen = new Set(
      Object.values(graph.nodes)
        .filter((node) => belongs(node, directory))
        .map((node) => node.id),
    )
    const queue = [...seen]
    while (queue.length) {
      const id = queue.shift()!
      for (const edge of graph.edges) {
        if (edge.from !== id && edge.to !== id) continue
        const next = edge.from === id ? edge.to : edge.from
        const node = graph.nodes[next]
        if (seen.has(next) || !node) continue
        const owner = node.meta?.directory
        if (typeof owner === "string" && !belongs(node, directory)) continue
        seen.add(next)
        queue.push(next)
      }
    }
    return {
      nodes: [...seen].map((id) => graph.nodes[id]).filter((node): node is Node => !!node),
      edges: graph.edges.filter((edge) => seen.has(edge.from) && seen.has(edge.to)),
    }
  }

  export const path_ = STORE_PATH
}
