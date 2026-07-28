import { For, Show, createEffect, createMemo, createResource, createSignal, onCleanup, type JSX } from "solid-js"
import { Dynamic } from "solid-js/web"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { settingsApi } from "@/components/settings/api"
import { FONT_MONO, FONT_SANS } from "@/styles/tokens"
import { toast } from "@/atlas/Toast"
import {
  IconActivity,
  IconAlertCircle,
  IconCheckCircle,
  IconClock,
  IconCpu,
  IconPlus,
  IconRefresh,
  IconStop,
  IconTrash,
} from "@/atlas/shared/Icon"

type Status = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "interrupted"
type Target = { kind: "local" } | { kind: "ssh"; host_id: string }

interface Host {
  id: string
  label: string
  host: string
  scheduler: "none" | "slurm" | "pbs"
  workdir?: string
}

interface Settings {
  ssh_hosts: Host[]
}

interface Job {
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
}

const terminal = new Set<Status>(["succeeded", "failed", "cancelled", "interrupted"])

export function ComputeJobs(): JSX.Element {
  const sdk = useGlobalSDK()
  const platform = usePlatform()
  const fetchFn = platform.fetch ?? fetch
  const call = <T,>(path: string, init?: RequestInit) =>
    settingsApi<T>(sdk.url, fetchFn, `/settings/compute${path}`, init)

  const [jobs, jobsApi] = createResource(() => call<Job[]>("/jobs"))
  const [settings] = createResource(() => call<Settings>(""))
  const [selected, setSelected] = createSignal<string>()
  const [creating, setCreating] = createSignal(false)
  const [busy, setBusy] = createSignal(false)
  const [name, setName] = createSignal("")
  const [command, setCommand] = createSignal("")
  const [cwd, setCwd] = createSignal("")
  const [target, setTarget] = createSignal("local")
  const current = createMemo(() => jobs()?.find((job) => job.id === selected()))
  const active = createMemo(() => jobs()?.filter((job) => !terminal.has(job.status)).length ?? 0)
  const [output, outputApi] = createResource(
    selected,
    async (id) => (await call<{ log: string }>(`/jobs/${id}/log`)).log,
  )

  createEffect(() => {
    const list = jobs()
    if (!list?.length) {
      setSelected(undefined)
      return
    }
    if (!selected() || !list.some((job) => job.id === selected())) setSelected(list[0].id)
  })

  const timer = setInterval(() => {
    void jobsApi.refetch()
    if (selected()) void outputApi.refetch()
  }, 1_500)
  onCleanup(() => clearInterval(timer))

  const reset = () => {
    setName("")
    setCommand("")
    setCwd("")
    setTarget("local")
    setCreating(false)
  }

  const start = async () => {
    if (!name().trim() || !command().trim()) return
    setBusy(true)
    const value = target()
    const next = await call<Job>("/jobs", {
      method: "POST",
      body: JSON.stringify({
        name: name().trim(),
        command: command().trim(),
        cwd: cwd().trim() || undefined,
        target: value === "local" ? { kind: "local" } : { kind: "ssh", host_id: value.slice(4) },
      }),
    }).catch((error) => {
      toast.error("job did not start", error instanceof Error ? error.message : String(error))
      return undefined
    })
    setBusy(false)
    if (!next) return
    jobsApi.mutate((list) => [next, ...(list ?? []).filter((job) => job.id !== next.id)])
    setSelected(next.id)
    reset()
    void jobsApi.refetch()
  }

  const cancel = async (job: Job) => {
    setBusy(true)
    const next = await call<Job>(`/jobs/${job.id}/cancel`, { method: "POST" }).catch((error) => {
      toast.error("job did not cancel", error instanceof Error ? error.message : String(error))
      return undefined
    })
    setBusy(false)
    if (!next) return
    jobsApi.mutate((list) => list?.map((item) => (item.id === next.id ? next : item)))
    void outputApi.refetch()
  }

  const rerun = (job: Job) => {
    setName(job.name)
    setCommand(job.command)
    setCwd(job.cwd ?? "")
    setTarget(job.target.kind === "local" ? "local" : `ssh:${job.target.host_id}`)
    setCreating(true)
  }

  const clear = async () => {
    setBusy(true)
    await call<{ cleared: number }>("/jobs/completed", { method: "DELETE" }).catch((error) =>
      toast.error("jobs were not cleared", error instanceof Error ? error.message : String(error)),
    )
    setBusy(false)
    await jobsApi.refetch()
  }

  return (
    <div style={shell}>
      <div style={header}>
        <div style={{ display: "flex", "align-items": "center", gap: "8px", "min-width": 0 }}>
          <span style={mark}>
            <IconCpu size={13} strokeWidth={1.5} />
          </span>
          <div style={{ display: "flex", "flex-direction": "column", "min-width": 0 }}>
            <span style={title}>compute jobs</span>
            <span style={subtitle}>{active() ? `${active()} active` : "local · SSH · schedulers"}</span>
          </div>
        </div>
        <div style={{ display: "flex", gap: "4px" }}>
          <Action title="refresh jobs" onClick={() => void jobsApi.refetch()}>
            <IconRefresh size={12} />
          </Action>
          <Action title="new job" active={creating()} onClick={() => setCreating((value) => !value)}>
            <IconPlus size={13} />
          </Action>
        </div>
      </div>

      <Show when={jobs.error}>
        <div role="alert" style={errorBox}>
          <span style={{ flex: 1 }}>
            Compute jobs are unavailable. {jobs.error instanceof Error ? jobs.error.message : String(jobs.error)}
          </span>
          <button type="button" style={secondaryButton} onClick={() => void jobsApi.refetch()}>
            retry
          </button>
        </div>
      </Show>

      <Show when={creating()}>
        <form
          style={form}
          onSubmit={(event) => {
            event.preventDefault()
            void start()
          }}
        >
          <input
            aria-label="Job name"
            style={input}
            value={name()}
            placeholder="Experiment name"
            onInput={(event) => setName(event.currentTarget.value)}
          />
          <div style={{ display: "grid", "grid-template-columns": "minmax(0, 1fr) minmax(0, 1fr)", gap: "6px" }}>
            <select
              aria-label="Compute target"
              style={input}
              value={target()}
              onChange={(event) => setTarget(event.currentTarget.value)}
            >
              <option value="local">This computer</option>
              <For each={settings()?.ssh_hosts}>
                {(host) => (
                  <option value={`ssh:${host.id}`}>
                    {host.label}
                    {host.scheduler === "none" ? "" : ` · ${host.scheduler}`}
                  </option>
                )}
              </For>
            </select>
            <input
              aria-label="Working directory"
              style={input}
              value={cwd()}
              placeholder="Working directory"
              onInput={(event) => setCwd(event.currentTarget.value)}
            />
          </div>
          <textarea
            aria-label="Command"
            style={{ ...input, height: "76px", resize: "vertical", "line-height": 1.45, padding: "9px 10px" }}
            value={command()}
            placeholder={"python train.py --config config.yaml"}
            spellcheck={false}
            onInput={(event) => setCommand(event.currentTarget.value)}
          />
          <div style={{ display: "flex", "justify-content": "flex-end", gap: "6px" }}>
            <button type="button" style={secondaryButton} onClick={reset}>
              cancel
            </button>
            <button type="submit" style={primaryButton} disabled={busy() || !name().trim() || !command().trim()}>
              {busy() ? "starting…" : "run job"}
            </button>
          </div>
        </form>
      </Show>

      <Show
        when={(jobs()?.length ?? 0) > 0}
        fallback={
          <div style={empty}>
            <span style={emptyMark}>
              <IconActivity size={18} />
            </span>
            <strong style={{ color: "var(--color-text)", "font-size": "12px" }}>No compute jobs yet</strong>
            <span>Run a script locally or send it to an SSH, Slurm, or PBS machine. Output stays attached here.</span>
            <button style={primaryButton} onClick={() => setCreating(true)}>
              create first job
            </button>
          </div>
        }
      >
        <div style={listHeader}>
          <span>recent runs</span>
          <button disabled={busy()} style={textButton} onClick={() => void clear()}>
            <IconTrash size={10} />
            clear finished
          </button>
        </div>
        <div style={list}>
          <For each={jobs()}>
            {(job) => (
              <button
                type="button"
                onClick={() => setSelected(job.id)}
                style={{
                  ...row,
                  background: selected() === job.id ? "var(--color-surface-solid)" : "transparent",
                  "border-color": selected() === job.id ? "var(--color-border-strong)" : "transparent",
                }}
              >
                <StatusIcon status={job.status} />
                <span style={{ display: "flex", "flex-direction": "column", gap: "3px", "min-width": 0, flex: 1 }}>
                  <span
                    style={{
                      color: "var(--color-text)",
                      "font-weight": 600,
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {job.name}
                  </span>
                  <span
                    style={{
                      color: "var(--color-text-faint)",
                      overflow: "hidden",
                      "text-overflow": "ellipsis",
                      "white-space": "nowrap",
                    }}
                  >
                    {job.target_label} · {job.scheduler === "none" ? job.status : `${job.scheduler} · ${job.status}`}
                  </span>
                </span>
                <span style={{ color: "var(--color-text-faint)", "font-size": "9px", "white-space": "nowrap" }}>
                  {age(job.created_at)}
                </span>
              </button>
            )}
          </For>
        </div>
      </Show>

      <Show when={current()}>
        {(job) => (
          <div style={detail}>
            <div style={{ display: "flex", "align-items": "flex-start", gap: "8px" }}>
              <div style={{ display: "flex", "flex-direction": "column", gap: "3px", flex: 1, "min-width": 0 }}>
                <span
                  style={{
                    color: "var(--color-text)",
                    "font-family": FONT_SANS,
                    "font-size": "12px",
                    "font-weight": 650,
                  }}
                >
                  {job().name}
                </span>
                <span style={{ color: "var(--color-text-faint)", "font-family": FONT_MONO, "font-size": "9px" }}>
                  {job().id} · {duration(job())}
                </span>
              </div>
              <Show when={!terminal.has(job().status)}>
                <Action title="cancel job" onClick={() => void cancel(job())}>
                  <IconStop size={11} />
                </Action>
              </Show>
              <button style={secondaryButton} onClick={() => rerun(job())}>
                rerun
              </button>
            </div>
            <div style={commandBox}>
              <span style={{ color: "var(--color-text-faint)", "user-select": "none" }}>$</span>
              <span>{job().command}</span>
            </div>
            <Show when={job().cwd}>
              <div style={meta}>cwd · {job().cwd}</div>
            </Show>
            <div style={logHeader}>
              <span>output</span>
              <span>{output.loading ? "syncing…" : `${output()?.length ?? 0} bytes`}</span>
            </div>
            <pre style={log}>
              {output() || (terminal.has(job().status) ? "No output was captured." : "Waiting for output…")}
            </pre>
            <Show when={job().error}>
              <div style={errorBox}>{job().error}</div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}

function StatusIcon(props: { status: Status }): JSX.Element {
  const config = () => {
    if (props.status === "succeeded") return { color: "var(--color-success)", icon: IconCheckCircle }
    if (props.status === "failed") return { color: "var(--color-danger)", icon: IconAlertCircle }
    if (props.status === "interrupted") return { color: "var(--color-warning)", icon: IconAlertCircle }
    if (props.status === "cancelled") return { color: "var(--color-text-faint)", icon: IconStop }
    if (props.status === "running") return { color: "var(--color-accent)", icon: IconActivity }
    return { color: "var(--color-text-muted)", icon: IconClock }
  }
  return (
    <span style={{ color: config().color, display: "inline-flex", "flex-shrink": 0 }}>
      <Dynamic component={config().icon} size={13} strokeWidth={1.7} />
    </span>
  )
}

function Action(props: { title: string; active?: boolean; onClick: () => void; children: JSX.Element }): JSX.Element {
  return (
    <button
      type="button"
      title={props.title}
      aria-label={props.title}
      onClick={props.onClick}
      style={{
        all: "unset",
        cursor: "pointer",
        width: "27px",
        height: "27px",
        display: "inline-flex",
        "align-items": "center",
        "justify-content": "center",
        "border-radius": "4px",
        border: "1px solid var(--color-border)",
        background: props.active ? "var(--color-accent-subtle)" : "var(--color-bg-elevated)",
        color: props.active ? "var(--color-accent)" : "var(--color-text-muted)",
        "box-sizing": "border-box",
      }}
    >
      {props.children}
    </button>
  )
}

function age(value: string): string {
  const delta = Math.max(0, Date.now() - Date.parse(value))
  if (delta < 60_000) return "now"
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)}h`
  return `${Math.floor(delta / 86_400_000)}d`
}

function duration(job: Job): string {
  if (!job.started_at) return job.status
  const end = job.completed_at ? Date.parse(job.completed_at) : Date.now()
  const seconds = Math.max(0, Math.round((end - Date.parse(job.started_at)) / 1_000))
  if (seconds < 60) return `${job.status} · ${seconds}s`
  return `${job.status} · ${Math.floor(seconds / 60)}m ${seconds % 60}s`
}

const shell: JSX.CSSProperties = {
  flex: 1,
  "min-height": 0,
  display: "flex",
  "flex-direction": "column",
  overflow: "hidden",
  background: "var(--color-bg-subtle)",
  "font-family": FONT_SANS,
}

const header: JSX.CSSProperties = {
  display: "flex",
  "align-items": "center",
  "justify-content": "space-between",
  gap: "10px",
  padding: "10px",
  "border-bottom": "1px solid var(--color-border)",
  background: "var(--color-bg)",
  "flex-shrink": 0,
}

const mark: JSX.CSSProperties = {
  width: "27px",
  height: "27px",
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  "border-radius": "6px",
  background: "color-mix(in srgb, var(--color-accent) 12%, transparent)",
  color: "var(--color-accent)",
}

const title: JSX.CSSProperties = {
  color: "var(--color-text)",
  "font-size": "12px",
  "font-weight": 680,
  "letter-spacing": "-0.01em",
}

const subtitle: JSX.CSSProperties = {
  color: "var(--color-text-faint)",
  "font-family": FONT_MONO,
  "font-size": "9px",
}

const form: JSX.CSSProperties = {
  display: "flex",
  "flex-direction": "column",
  gap: "7px",
  padding: "10px",
  "border-bottom": "1px solid var(--color-border)",
  background: "var(--color-surface-solid)",
  "flex-shrink": 0,
}

const input: JSX.CSSProperties = {
  width: "100%",
  height: "32px",
  "box-sizing": "border-box",
  border: "1px solid var(--color-border)",
  "border-radius": "4px",
  background: "var(--color-bg)",
  color: "var(--color-text)",
  padding: "0 9px",
  outline: "none",
  "font-family": FONT_MONO,
  "font-size": "10px",
}

const primaryButton: JSX.CSSProperties = {
  cursor: "pointer",
  border: "1px solid var(--color-accent)",
  "border-radius": "4px",
  background: "var(--color-accent)",
  color: "var(--color-bg)",
  padding: "6px 10px",
  "font-family": FONT_MONO,
  "font-size": "10px",
  "font-weight": 650,
}

const secondaryButton: JSX.CSSProperties = {
  cursor: "pointer",
  border: "1px solid var(--color-border)",
  "border-radius": "4px",
  background: "var(--color-bg-elevated)",
  color: "var(--color-text-muted)",
  padding: "5px 8px",
  "font-family": FONT_MONO,
  "font-size": "10px",
}

const empty: JSX.CSSProperties = {
  display: "flex",
  "flex-direction": "column",
  "align-items": "center",
  gap: "8px",
  padding: "36px 22px",
  color: "var(--color-text-muted)",
  "font-size": "11px",
  "line-height": 1.5,
  "text-align": "center",
}

const emptyMark: JSX.CSSProperties = {
  width: "38px",
  height: "38px",
  display: "inline-flex",
  "align-items": "center",
  "justify-content": "center",
  "border-radius": "10px",
  background: "var(--color-surface-solid)",
  border: "1px solid var(--color-border)",
  color: "var(--color-text-faint)",
}

const listHeader: JSX.CSSProperties = {
  display: "flex",
  "align-items": "center",
  "justify-content": "space-between",
  padding: "8px 10px 4px",
  color: "var(--color-text-faint)",
  "font-family": FONT_MONO,
  "font-size": "9px",
  "text-transform": "uppercase",
  "letter-spacing": "0.08em",
}

const textButton: JSX.CSSProperties = {
  all: "unset",
  cursor: "pointer",
  display: "inline-flex",
  "align-items": "center",
  gap: "4px",
  color: "var(--color-text-faint)",
  "font-size": "9px",
  "text-transform": "none",
  "letter-spacing": "normal",
}

const list: JSX.CSSProperties = {
  display: "flex",
  "flex-direction": "column",
  gap: "2px",
  padding: "3px 7px 8px",
  "max-height": "190px",
  overflow: "auto",
  "flex-shrink": 0,
  "border-bottom": "1px solid var(--color-border)",
}

const row: JSX.CSSProperties = {
  cursor: "pointer",
  width: "100%",
  display: "flex",
  "align-items": "center",
  gap: "8px",
  padding: "8px",
  border: "1px solid transparent",
  "border-radius": "5px",
  "text-align": "left",
  "font-family": FONT_MONO,
  "font-size": "10px",
}

const detail: JSX.CSSProperties = {
  flex: 1,
  "min-height": 0,
  overflow: "auto",
  display: "flex",
  "flex-direction": "column",
  gap: "8px",
  padding: "10px",
  background: "var(--color-bg)",
}

const commandBox: JSX.CSSProperties = {
  display: "flex",
  gap: "7px",
  padding: "8px",
  border: "1px solid var(--color-border)",
  "border-radius": "4px",
  background: "var(--color-bg-subtle)",
  color: "var(--color-text-muted)",
  "font-family": FONT_MONO,
  "font-size": "10px",
  "line-height": 1.45,
  "white-space": "pre-wrap",
  "overflow-wrap": "anywhere",
}

const meta: JSX.CSSProperties = {
  color: "var(--color-text-faint)",
  "font-family": FONT_MONO,
  "font-size": "9px",
  overflow: "hidden",
  "text-overflow": "ellipsis",
  "white-space": "nowrap",
}

const logHeader: JSX.CSSProperties = {
  display: "flex",
  "justify-content": "space-between",
  color: "var(--color-text-faint)",
  "font-family": FONT_MONO,
  "font-size": "9px",
  "text-transform": "uppercase",
  "letter-spacing": "0.08em",
  "margin-top": "2px",
}

const log: JSX.CSSProperties = {
  flex: 1,
  "min-height": "100px",
  margin: 0,
  padding: "10px",
  border: "1px solid var(--color-border)",
  "border-radius": "4px",
  background: "#101411",
  color: "#c9d4cc",
  "font-family": FONT_MONO,
  "font-size": "10px",
  "line-height": 1.55,
  "white-space": "pre-wrap",
  "overflow-wrap": "anywhere",
  overflow: "auto",
}

const errorBox: JSX.CSSProperties = {
  display: "flex",
  "align-items": "center",
  gap: "8px",
  padding: "8px",
  "border-radius": "4px",
  border: "1px solid color-mix(in srgb, var(--color-danger) 35%, transparent)",
  background: "color-mix(in srgb, var(--color-danger) 8%, transparent)",
  color: "var(--color-danger)",
  "font-family": FONT_MONO,
  "font-size": "9px",
  "line-height": 1.45,
}
