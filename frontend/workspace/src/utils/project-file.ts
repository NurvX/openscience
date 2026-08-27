import { resolveArtifactPath } from "@/artifacts/context"

const clean = (value: string) => value.replaceAll("\\", "/").replace(/\/+$/, "") || "/"

function normalize(value: string) {
  const input = clean(value)
  const drive = /^[A-Za-z]:\//.exec(input)?.[0]
  const prefix = drive ?? (input.startsWith("/") ? "/" : "")
  const body = drive ? input.slice(drive.length) : prefix ? input.slice(1) : input
  const parts: string[] = []
  for (const part of body.split("/")) {
    if (!part || part === ".") continue
    if (part === "..") {
      if (parts.length && parts.at(-1) !== "..") parts.pop()
      else if (!prefix) parts.push(part)
      continue
    }
    parts.push(part)
  }
  return `${prefix}${parts.join("/")}` || (prefix ? prefix : ".")
}

/** True when an artifact belongs to this connected project root rather than another session grant. */
export function projectContains(directory: string, file: string) {
  const root = normalize(directory)
  const target = normalize(resolveArtifactPath(directory, file))
  const windows = /^[A-Za-z]:\//.test(root) || /^[A-Za-z]:\//.test(target)
  const base = windows ? root.toLowerCase() : root
  const path = windows ? target.toLowerCase() : target
  return path === base || path.startsWith(base === "/" ? base : `${base}/`)
}

/**
 * Chat responses sometimes introduce a directory once, then list its files by
 * basename. Keep explicit paths authoritative, but allow the file viewer to
 * recover a bare filename when the project contains exactly one matching
 * regular-file path. Ambiguous, truncated, or non-project results fail closed.
 */
export function resolveUniqueProjectFileReference(
  reference: string,
  matches: string[],
  options: { complete?: boolean } = {},
) {
  const requested = reference.trim().replaceAll("\\", "/")
  if (!requested || requested.includes("/") || requested === "." || requested === "..") return
  if (options.complete === false) return

  const exact = new Set<string>()
  for (const match of matches) {
    const candidate = normalize(match)
    if (
      candidate === "." ||
      candidate === ".." ||
      candidate.startsWith("../") ||
      candidate.startsWith("/") ||
      /^[A-Za-z]:\//.test(candidate)
    ) {
      continue
    }
    if (candidate.split("/").at(-1) === requested) exact.add(candidate)
  }
  return exact.size === 1 ? exact.values().next().value : undefined
}

/** Build a session-authorized project-file query, with an optional path for collection endpoints. */
export type FileScope = "project" | "session"

export function projectFileQuery(input: { directory: string; path?: string; sessionID?: string; scope?: FileScope }) {
  return {
    ...(input.path
      ? { path: input.scope === "session" ? input.path : resolveArtifactPath(input.directory, input.path) }
      : {}),
    ...(input.sessionID ? { sessionID: input.sessionID } : {}),
  }
}

/** Build a raw-file query for either the durable project root or session scratch. */
export function rawFileQuery(input: {
  directory: string
  path: string
  sessionID?: string
  scope?: FileScope
  maxBytes?: number
  inline?: boolean
}) {
  return {
    ...projectFileQuery(input),
    ...(input.maxBytes !== undefined ? { maxBytes: input.maxBytes } : {}),
    ...(input.inline !== undefined ? { inline: input.inline ? "true" : "false" } : {}),
  }
}
