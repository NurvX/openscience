import { For, Show, createResource, createSignal, type Component, type JSX } from "solid-js"
import { Button } from "@synsci/ui/button"
import { Select } from "@synsci/ui/select"
import { showToast } from "@synsci/ui/toast"
import { useDialog } from "@synsci/ui/context/dialog"
import { useGlobalSDK } from "@/context/global-sdk"
import { usePlatform } from "@/context/platform"
import { confirmDialog } from "@/atlas/dialogs"
import { settingsApi } from "./api"

type Scheduler = "none" | "slurm" | "pbs"
type Host = {
  id: string
  label: string
  host: string
  user?: string
  port?: number
  scheduler: Scheduler
  workdir?: string
}
type Info = { ssh_hosts: Host[] }
type Probe = {
  ok: boolean
  host: string
  latency_ms: number
  hostname?: string
  python: boolean
  gpu: boolean
  slurm: boolean
  pbs: boolean
  error?: string
}

const schedulers = [
  { value: "none" as const, label: "Plain SSH" },
  { value: "slurm" as const, label: "Slurm" },
  { value: "pbs" as const, label: "PBS" },
]

const Compute: Component = () => {
  const sdk = useGlobalSDK()
  const platform = usePlatform()
  const dialog = useDialog()
  const fetchFn = platform.fetch ?? fetch
  const call = <T,>(path = "", init?: RequestInit) => settingsApi<T>(sdk.url, fetchFn, `/settings/compute${path}`, init)
  const [data, control] = createResource(() => call<Info>())
  const [adding, setAdding] = createSignal(false)
  const [busy, setBusy] = createSignal<string>()
  const [probes, setProbes] = createSignal<Record<string, Probe>>({})
  const [label, setLabel] = createSignal("")
  const [host, setHost] = createSignal("")
  const [user, setUser] = createSignal("")
  const [port, setPort] = createSignal("")
  const [scheduler, setScheduler] = createSignal<Scheduler>("none")
  const [workdir, setWorkdir] = createSignal("")

  const reset = () => {
    setLabel("")
    setHost("")
    setUser("")
    setPort("")
    setScheduler("none")
    setWorkdir("")
    setAdding(false)
  }

  const add = async () => {
    const parsedPort = port().trim() ? Number(port()) : undefined
    if (parsedPort !== undefined && (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535)) {
      showToast({ title: "Invalid SSH port", description: "Use a port between 1 and 65535." })
      return
    }
    setBusy("add")
    const next = await call<Info>("/ssh", {
      method: "POST",
      body: JSON.stringify({
        label: label().trim(),
        host: host().trim(),
        user: user().trim() || undefined,
        port: parsedPort,
        scheduler: scheduler(),
        workdir: workdir().trim() || undefined,
      }),
    }).catch((error) => {
      showToast({ title: "Could not add SSH host", description: message(error) })
      return undefined
    })
    setBusy(undefined)
    if (!next) return
    control.mutate(next)
    reset()
    showToast({ variant: "success", title: "SSH host added", description: "Test the connection before dispatch." })
  }

  const test = async (item: Host) => {
    setBusy(`test:${item.id}`)
    const result = await call<Probe>(`/ssh/${item.id}/test`, { method: "POST" }).catch((error) => ({
      ok: false,
      host: item.label,
      latency_ms: 0,
      python: false,
      gpu: false,
      slurm: false,
      pbs: false,
      error: message(error),
    }))
    setProbes((current) => ({ ...current, [item.id]: result }))
    setBusy(undefined)
    showToast({
      variant: result.ok ? "success" : "error",
      title: result.ok ? `${item.label} is reachable` : `Could not reach ${item.label}`,
      description: result.ok ? `${result.latency_ms} ms · ${capabilities(result)}` : result.error,
    })
  }

  const remove = async (item: Host) => {
    const confirmed = await confirmDialog(dialog, {
      title: `Remove ${item.label}?`,
      message: "This removes the saved connection profile. It does not change or delete anything on the remote host.",
      confirmLabel: "Remove host",
      danger: true,
    })
    if (!confirmed) return
    setBusy(`remove:${item.id}`)
    const next = await call<Info>(`/ssh/${item.id}`, { method: "DELETE" }).catch((error) => {
      showToast({ title: "Could not remove SSH host", description: message(error) })
      return undefined
    })
    setBusy(undefined)
    if (!next) return
    control.mutate(next)
    setProbes((current) => Object.fromEntries(Object.entries(current).filter(([id]) => id !== item.id)))
  }

  return (
    <div class="flex flex-col h-full overflow-y-auto no-scrollbar">
      <div class="sticky top-0 z-10 bg-[linear-gradient(to_bottom,var(--surface-raised-stronger-non-alpha)_calc(100%_-_24px),transparent)]">
        <div class="flex flex-col gap-1 px-4 py-8 sm:p-8 max-w-[820px]">
          <h2 class="text-16-medium text-text-strong">Compute</h2>
          <p class="text-13-regular text-text-weak">Choose where kernels and research jobs can run safely.</p>
        </div>
      </div>

      <div class="flex flex-col gap-8 px-4 pb-12 sm:px-8 max-w-[820px]">
        <Section title="Local machine" subtitle="The default execution target for this OpenScience server.">
          <Panel>
            <Row title="This machine" subtitle="Persistent kernels and batch jobs use the active session sandbox.">
              <Badge tone="ready">available</Badge>
            </Row>
          </Panel>
        </Section>

        <Section title="Remote compute" subtitle="Connect directly over SSH. Atlas is not required.">
          <div class="flex flex-col gap-3">
            <Show
              when={!data.loading}
              fallback={
                <Panel>
                  <Row title="Loading SSH hosts" subtitle="Reading saved compute profiles.">
                    <Badge>loading</Badge>
                  </Row>
                </Panel>
              }
            >
              <Show
                when={(data()?.ssh_hosts.length ?? 0) > 0}
                fallback={
                  <Panel>
                    <Row
                      title="No remote hosts connected"
                      subtitle="Add a plain SSH, Slurm, or PBS host, then run a real connection check."
                    >
                      <Button size="small" variant="secondary" onClick={() => setAdding(true)}>
                        add host
                      </Button>
                    </Row>
                  </Panel>
                }
              >
                <Panel>
                  <For each={data()?.ssh_hosts}>
                    {(item) => {
                      const probe = () => probes()[item.id]
                      return (
                        <div class="flex flex-wrap items-center gap-4 px-4 py-3.5 border-b border-border-weak-base last:border-none">
                          <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-2">
                              <span class="text-14-medium text-text-strong truncate">{item.label}</span>
                              <Badge tone={probe()?.ok ? "ready" : undefined}>
                                {probe()?.ok ? "verified now" : schedulerLabel(item.scheduler)}
                              </Badge>
                            </div>
                            <p class="text-12-regular text-text-weak mt-0.5 truncate">
                              {destination(item)}
                              {item.workdir ? ` · ${item.workdir}` : ""}
                            </p>
                            <Show when={probe()}>
                              {(result) => (
                                <p
                                  class={
                                    result().ok
                                      ? "text-11-regular text-text-success mt-1"
                                      : "text-11-regular text-text-danger mt-1"
                                  }
                                >
                                  {result().ok
                                    ? `${result().latency_ms} ms · ${capabilities(result())}`
                                    : result().error}
                                </p>
                              )}
                            </Show>
                          </div>
                          <div class="flex items-center gap-2">
                            <Button
                              size="small"
                              variant="secondary"
                              disabled={Boolean(busy())}
                              onClick={() => void test(item)}
                            >
                              {busy() === `test:${item.id}` ? "testing…" : "test"}
                            </Button>
                            <Button
                              size="small"
                              variant="ghost"
                              disabled={Boolean(busy())}
                              onClick={() => void remove(item)}
                            >
                              remove
                            </Button>
                          </div>
                        </div>
                      )
                    }}
                  </For>
                </Panel>
              </Show>
            </Show>

            <Show when={(data()?.ssh_hosts.length ?? 0) > 0 && !adding()}>
              <Button size="small" variant="secondary" onClick={() => setAdding(true)}>
                add another host
              </Button>
            </Show>

            <Show when={adding()}>
              <form
                class="grid gap-4 border border-border-weak-base rounded-[6px] bg-surface-base/40 p-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  void add()
                }}
              >
                <div>
                  <h4 class="text-14-medium text-text-strong">New SSH host</h4>
                  <p class="text-12-regular text-text-weak mt-0.5">
                    OpenScience uses your existing SSH agent and config. Private keys are never copied into the app.
                  </p>
                </div>
                <div class="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" value={label()} placeholder="Lab cluster" onInput={setLabel} />
                  <Field label="Hostname" value={host()} placeholder="hpc.example.edu" onInput={setHost} />
                  <Field label="User" value={user()} placeholder="Optional" onInput={setUser} />
                  <Field label="Port" value={port()} placeholder="22" inputMode="numeric" onInput={setPort} />
                  <label class="flex flex-col gap-1.5">
                    <span class="text-12-medium text-text-strong">Scheduler</span>
                    <Select
                      aria-label="Scheduler"
                      options={schedulers}
                      current={schedulers.find((item) => item.value === scheduler())}
                      value={(item) => item.value}
                      label={(item) => item.label}
                      onSelect={(item) => item && setScheduler(item.value)}
                      variant="secondary"
                      size="small"
                      triggerVariant="settings"
                    />
                  </label>
                  <Field
                    label="Remote working directory"
                    value={workdir()}
                    placeholder="~/research"
                    onInput={setWorkdir}
                  />
                </div>
                <div class="flex items-center justify-end gap-2">
                  <Button size="small" variant="ghost" disabled={busy() === "add"} onClick={reset}>
                    cancel
                  </Button>
                  <Button
                    type="submit"
                    size="small"
                    variant="primary"
                    disabled={!label().trim() || !host().trim() || busy() === "add"}
                  >
                    {busy() === "add" ? "adding…" : "add host"}
                  </Button>
                </div>
              </form>
            </Show>
          </div>
        </Section>

        <Section title="Atlas Compute" subtitle="Managed accelerators require the separate Atlas integration.">
          <Panel>
            <Row
              title="Managed accelerators"
              subtitle="Machine, provider, price, duration, and funding will be shown before any paid run starts."
            >
              <Badge>coming later</Badge>
            </Row>
          </Panel>
        </Section>
      </div>
    </div>
  )
}

export default Compute

const Field: Component<{
  label: string
  value: string
  placeholder: string
  inputMode?: JSX.InputHTMLAttributes<HTMLInputElement>["inputMode"]
  onInput: (value: string) => void
}> = (props) => (
  <label class="flex flex-col gap-1.5">
    <span class="text-12-medium text-text-strong">{props.label}</span>
    <input
      class="h-9 px-3 rounded-xs border border-border-weak-base bg-surface-base text-13-regular text-text-strong outline-none focus:border-border-strong-base"
      value={props.value}
      placeholder={props.placeholder}
      inputMode={props.inputMode}
      onInput={(event) => props.onInput(event.currentTarget.value)}
    />
  </label>
)

const Section: Component<{ title: string; subtitle: string; children: JSX.Element }> = (props) => (
  <section class="flex flex-col gap-3">
    <div class="flex flex-col gap-0.5">
      <h3 class="text-13-medium text-text-weak tracking-wide">{props.title}</h3>
      <p class="text-12-regular text-text-weak">{props.subtitle}</p>
    </div>
    {props.children}
  </section>
)

const Panel: Component<{ children: JSX.Element }> = (props) => (
  <div class="border border-border-weak-base rounded-[6px] overflow-hidden bg-surface-base/40">{props.children}</div>
)

const Row: Component<{ title: string; subtitle: string; children: JSX.Element }> = (props) => (
  <div class="flex flex-wrap items-center justify-between gap-4 px-4 py-3.5">
    <div class="flex flex-col gap-0.5 min-w-0">
      <span class="text-14-medium text-text-strong">{props.title}</span>
      <span class="text-12-regular text-text-weak">{props.subtitle}</span>
    </div>
    <div class="flex-shrink-0">{props.children}</div>
  </div>
)

const Badge: Component<{ tone?: "ready"; children: JSX.Element }> = (props) => (
  <span
    class={
      props.tone === "ready"
        ? "inline-flex items-center gap-1.5 text-11-medium text-text-success"
        : "inline-flex items-center rounded-[4px] px-2 py-1 text-11-medium text-text-weak bg-surface-base"
    }
  >
    {props.tone === "ready" ? <span class="size-1.5 rounded-full bg-current" aria-hidden="true" /> : undefined}
    {props.children}
  </span>
)

function destination(host: Host) {
  const login = host.user ? `${host.user}@${host.host}` : host.host
  return host.port ? `${login}:${host.port}` : login
}

function schedulerLabel(scheduler: Scheduler) {
  if (scheduler === "slurm") return "Slurm"
  if (scheduler === "pbs") return "PBS"
  return "SSH"
}

function capabilities(probe: Probe) {
  const values = [
    probe.hostname,
    probe.python ? "Python" : undefined,
    probe.gpu ? "GPU" : undefined,
    probe.slurm ? "Slurm" : undefined,
    probe.pbs ? "PBS" : undefined,
  ]
  return values.filter((value): value is string => Boolean(value)).join(" · ") || "SSH ready"
}

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
