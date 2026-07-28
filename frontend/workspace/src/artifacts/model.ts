export const artifactKinds = [
  "notebook",
  "dataset",
  "figure",
  "report",
  "structure",
  "sequence",
  "genomics",
  "spectrum",
  "model",
  "archive",
] as const

export type ArtifactKind = (typeof artifactKinds)[number]
export type ArtifactSort = "recent" | "size" | "name"

export interface ArtifactInfo {
  name: string
  path: string
  kind: ArtifactKind
  format: string
  size: number
  modified: number
}

const kinds = new Set<string>(artifactKinds)

export function normalizeArtifacts(value: unknown): ArtifactInfo[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item): ArtifactInfo[] => {
    if (!item || typeof item !== "object") return []
    const row = item as Record<string, unknown>
    if (
      typeof row.name !== "string" ||
      typeof row.path !== "string" ||
      typeof row.kind !== "string" ||
      !kinds.has(row.kind) ||
      typeof row.format !== "string" ||
      typeof row.size !== "number" ||
      typeof row.modified !== "number"
    )
      return []
    return [
      {
        name: row.name,
        path: row.path,
        kind: row.kind as ArtifactKind,
        format: row.format,
        size: row.size,
        modified: row.modified,
      },
    ]
  })
}

export function filterArtifacts(rows: ArtifactInfo[], kind: ArtifactKind | "all", query: string): ArtifactInfo[] {
  const term = query.trim().toLowerCase()
  return rows.filter((row) => {
    if (kind !== "all" && row.kind !== kind) return false
    if (!term) return true
    return `${row.name}\n${row.path}\n${row.format}\n${row.kind}`.toLowerCase().includes(term)
  })
}

export function sortArtifacts(rows: ArtifactInfo[], sort: ArtifactSort): ArtifactInfo[] {
  return rows.toSorted((a, b) => {
    if (sort === "recent") return b.modified - a.modified || a.name.localeCompare(b.name)
    if (sort === "size") return b.size - a.size || a.name.localeCompare(b.name)
    return a.name.localeCompare(b.name)
  })
}

export function groupArtifacts(rows: ArtifactInfo[]): { kind: ArtifactKind; count: number }[] {
  const counts = rows.reduce<Partial<Record<ArtifactKind, number>>>(
    (all, row) => ({ ...all, [row.kind]: (all[row.kind] ?? 0) + 1 }),
    {},
  )
  return Object.entries(counts)
    .map(([kind, count]) => ({ kind: kind as ArtifactKind, count }))
    .toSorted((a, b) => a.kind.localeCompare(b.kind))
}

export function formatArtifactKind(kind: ArtifactKind): string {
  if (kind === "genomics") return "genomics"
  if (kind === "spectrum") return "mass spec"
  return kind
}
