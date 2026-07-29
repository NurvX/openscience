import type { ArtifactContext } from "./context"

export const inspectorTabs = ["details", "code", "run", "messages", "environment", "review", "history"] as const
export type InspectorTab = (typeof inspectorTabs)[number]

export interface ArtifactCommit {
  sha: string
  author: string
  email: string
  date: string
  message: string
}

export interface ArtifactProvenance {
  path: string
  tracked: boolean
  dirty: boolean
  status: "clean" | "modified" | "added" | "deleted" | "untracked" | "local"
  branch?: string
  commit?: ArtifactCommit
}

export interface InspectorState {
  available: boolean
  title: string
  detail: string
}

export interface InspectorData {
  context: ArtifactContext
  source?: string
  provenance?: ArtifactProvenance
  environments: string[]
  lockfiles: string[]
  tabs: Record<InspectorTab, InspectorState>
}

interface InspectorInput {
  file?: unknown
  provenance?: unknown
  audit?: unknown
}

function record(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return
  return value as Record<string, unknown>
}

function strings(value: unknown): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return []
  return value
}

function commit(value: unknown): ArtifactCommit | undefined {
  const row = record(value)
  if (!row) return
  if (
    typeof row.sha !== "string" ||
    typeof row.author !== "string" ||
    typeof row.email !== "string" ||
    typeof row.date !== "string" ||
    typeof row.message !== "string"
  )
    return
  return {
    sha: row.sha,
    author: row.author,
    email: row.email,
    date: row.date,
    message: row.message,
  }
}

function provenance(value: unknown): ArtifactProvenance | undefined {
  const row = record(value)
  if (!row) return
  const statuses = new Set(["clean", "modified", "added", "deleted", "untracked", "local"])
  if (
    typeof row.path !== "string" ||
    typeof row.tracked !== "boolean" ||
    typeof row.dirty !== "boolean" ||
    typeof row.status !== "string" ||
    !statuses.has(row.status)
  )
    return
  const version = row.commit === undefined ? undefined : commit(row.commit)
  if (row.commit !== undefined && !version) return
  return {
    path: row.path,
    tracked: row.tracked,
    dirty: row.dirty,
    status: row.status as ArtifactProvenance["status"],
    ...(typeof row.branch === "string" ? { branch: row.branch } : {}),
    ...(version ? { commit: version } : {}),
  }
}

function source(value: unknown): string | undefined {
  const row = record(value)
  if (!row || row.encoding === "base64" || typeof row.content !== "string") return
  return row.content
}

function state(available: boolean, title: string, detail: string): InspectorState {
  return { available, title, detail }
}

export function normalizeInspectorData(context: ArtifactContext, input: InspectorInput): InspectorData {
  const text = source(input.file)
  const version = provenance(input.provenance)
  const audit = record(input.audit)
  const environments = strings(audit?.environments)
  const lockfiles = strings(audit?.lockfiles)
  const environment = environments.length > 0 || lockfiles.length > 0
  return {
    context,
    ...(text !== undefined ? { source: text } : {}),
    ...(version ? { provenance: version } : {}),
    environments,
    lockfiles,
    tabs: {
      details: state(true, "Artifact details", "Format, location, and recorded scientific metadata."),
      code:
        text !== undefined
          ? state(true, "Source available", "The original text source is available for inspection.")
          : state(false, "Source is not directly displayable", "Open the file view or download the original artifact."),
      run: state(false, "No generating run is recorded", "Execute or attach a run to connect logs and resources."),
      messages: state(
        false,
        "No message range is recorded",
        "Artifacts created from a conversation will show the exact producing messages here.",
      ),
      environment: environment
        ? state(true, "Environment records found", "Project environment specifications and lockfiles are available.")
        : state(false, "No environment is recorded", "Add a lockfile or environment specification to this project."),
      review: state(
        false,
        "No review report is recorded",
        "Run scientific review before treating this artifact as publication-ready.",
      ),
      history: version?.commit
        ? state(true, "Git provenance available", "The latest commit touching this artifact is recorded.")
        : state(false, "No Git commit is recorded", "Commit this artifact to create a recoverable version."),
    },
  }
}
