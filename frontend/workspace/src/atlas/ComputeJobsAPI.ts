import type { ProjectRequest } from "@/utils/openscience-fetch"

export type Status = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted"
export type Target = { kind: "local" } | { kind: "ssh"; host_id: string }

export interface Artifact {
  path: string
  size: number
  sha256: string
  modified_at: string
}

export interface Resources {
  cpus?: number
  gpus?: number
  memory_gb?: number
  time_minutes?: number
  partition?: string
}

export interface Reproducibility {
  captured_at: string
  command: string
  cwd: string
  platform: string
  arch: string
  bun: string
  node: string
  python?: string
  git?: {
    branch?: string
    commit?: string
    dirty: boolean
  }
  lockfiles: Artifact[]
  resources?: Resources
}

export interface Job {
  id: string
  name: string
  command: string
  cwd?: string
  target: Target
  target_label: string
  scheduler: "none" | "slurm" | "pbs"
  status: Status
  created_at: string
  started_at?: string
  completed_at?: string
  exit_code?: number | null
  error?: string
  resources?: Resources
  modules?: string[]
  container?: string
  artifact_patterns?: string[]
  artifacts?: Artifact[]
  checkpoint_path?: string
  checkpoint?: Artifact
  reproducibility?: Reproducibility
  capture_error?: string
}

export interface JobInput {
  sessionID: string
  name: string
  command: string
  cwd?: string
  target: Target
  resources?: Resources
  modules?: string[]
  container?: string
  artifacts?: string[]
  checkpoint?: string
}

export function createComputeJobsAPI(request: ProjectRequest) {
  const call = async <T>(path: string, init?: RequestInit) => {
    const response = await request(`/settings/compute/jobs${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      throw new Error(detail || `${response.status} ${response.statusText}`)
    }
    if (response.status === 204) return undefined as T
    const content = response.headers.get("content-type") ?? ""
    if (!content.includes("application/json")) {
      throw new Error(`Expected JSON from compute jobs, but got ${response.status} (${content || "no content-type"})`)
    }
    return response.json() as Promise<T>
  }
  return {
    list: () => call<Job[]>(""),
    start: (input: JobInput) => call<Job>("", { method: "POST", body: JSON.stringify(input) }),
    log: (id: string) => call<{ log: string }>(`/${id}/log`),
    cancel: (id: string) => call<Job>(`/${id}/cancel`, { method: "POST" }),
    clear: () => call<{ cleared: number }>("/completed", { method: "DELETE" }),
  }
}
