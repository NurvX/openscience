import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createResource,
  createSignal,
  type JSX,
} from "solid-js"
import { usePlatform } from "@/context/platform"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { centerTabs } from "@/atlas/store/centerTabs"
import { toast } from "@/atlas/Toast"
import {
  IconBookOpen,
  IconBraces,
  IconClock,
  IconCopy,
  IconDownload,
  IconFile,
  IconFlask,
  IconMessageSquare,
  IconRefresh,
  IconSettings,
} from "@/atlas/shared/Icon"
import { FONT_CODE, FONT_MONO, FONT_SANS } from "@/styles/tokens"
import type { ArtifactContext } from "./context"
import {
  inspectorTabs,
  normalizeInspectorData,
  type InspectorData,
  type InspectorState,
  type InspectorTab,
} from "./inspector"

const labels: Record<InspectorTab, string> = {
  details: "Details",
  code: "Code",
  run: "Run",
  messages: "Messages",
  environment: "Environment",
  review: "Review",
  history: "History",
}

export function ArtifactInspector(props: { context: ArtifactContext; onClose?: () => void }): JSX.Element {
  const sdk = useSDK()
  const platform = usePlatform()
  const prompt = usePrompt()
  const [tab, setTab] = createSignal<InspectorTab>("details")
  const request = () => platform.fetch ?? fetch
  const url = (route: string, path?: string) =>
    `${sdk.url.replace(/\/$/, "")}${route}?directory=${encodeURIComponent(props.context.directory)}${path ? `&path=${encodeURIComponent(path)}` : ""}`

  const [records, api] = createResource(
    () => ({ id: props.context.id, path: props.context.path, directory: props.context.directory }),
    async (current) => {
      const read = async (route: string, path?: string): Promise<unknown> => {
        const response = await request()(url(route, path)).catch(() => undefined)
        if (!response?.ok) return
        return response.json().catch(() => undefined)
      }
      const [file, provenance, audit] = await Promise.all([
        read("/file/content", current.path),
        read("/file/provenance", current.path),
        read("/file/reproducibility"),
      ])
      return { id: current.id, file, provenance, audit }
    },
  )
  const model = createMemo<InspectorData>(() => {
    const value = records()
    const input = value?.id === props.context.id ? value : {}
    return normalizeInspectorData(props.context, input)
  })

  createEffect(() => {
    props.context.id
    setTab("details")
  })

  const copy = async () => {
    await navigator.clipboard?.writeText(props.context.path)
    toast.success("copied", props.context.path)
  }
  const attach = () => {
    prompt.context.add({ type: "file", path: props.context.path })
    centerTabs.showChat()
    toast.success("added to context", props.context.name)
  }
  const download = async () => {
    const response = await request()(url("/file/raw", props.context.path)).catch(() => undefined)
    if (!response?.ok) {
      toast.error("download failed", response ? `${response.status}` : "request failed")
      return
    }
    const object = URL.createObjectURL(await response.blob())
    const anchor = document.createElement("a")
    anchor.href = object
    anchor.download = props.context.name
    anchor.click()
    URL.revokeObjectURL(object)
  }

  const move = (event: KeyboardEvent, current: InspectorTab) => {
    const index = inspectorTabs.indexOf(current)
    const next =
      event.key === "Home"
        ? inspectorTabs[0]
        : event.key === "End"
          ? inspectorTabs.at(-1)
          : event.key === "ArrowRight"
            ? inspectorTabs[(index + 1) % inspectorTabs.length]
            : event.key === "ArrowLeft"
              ? inspectorTabs[(index - 1 + inspectorTabs.length) % inspectorTabs.length]
              : undefined
    if (!next) return
    event.preventDefault()
    setTab(next)
    document.getElementById(`artifact-inspector-tab-${next}`)?.focus()
  }

  return (
    <section
      data-component="artifact-inspector"
      data-artifact-id={props.context.id}
      style={{
        flex: 1,
        "min-height": 0,
        display: "flex",
        "flex-direction": "column",
        background: "var(--color-bg)",
      }}
    >
      <header
        style={{
          display: "flex",
          "align-items": "center",
          gap: "10px",
          padding: "12px 14px",
          "border-bottom": "1px solid var(--color-border)",
          "flex-shrink": 0,
        }}
      >
        <span style={{ display: "inline-flex", color: "var(--color-text-muted)" }}>
          <IconFile size={15} strokeWidth={1.5} />
        </span>
        <div style={{ flex: 1, "min-width": 0, display: "grid", gap: "2px" }}>
          <strong
            title={props.context.path}
            style={{
              "font-family": FONT_SANS,
              "font-size": "13px",
              color: "var(--color-text)",
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
            }}
          >
            {props.context.name}
          </strong>
          <span style={{ "font-family": FONT_MONO, "font-size": "10px", color: "var(--color-text-faint)" }}>
            {props.context.kind} · {props.context.format.toUpperCase()}
          </span>
        </div>
        <button type="button" title="refresh artifact records" style={iconButton()} onClick={() => void api.refetch()}>
          <IconRefresh size={13} />
        </button>
        <Show when={props.onClose}>
          <button type="button" style={quietButton()} onClick={() => props.onClose?.()}>
            close
          </button>
        </Show>
      </header>

      <div style={{ display: "grid", "grid-template-columns": "repeat(3, 1fr)", gap: "6px", padding: "10px 12px" }}>
        <button type="button" style={actionButton(true)} onClick={attach}>
          <IconFlask size={12} /> ask
        </button>
        <button type="button" style={actionButton()} onClick={() => void copy()}>
          <IconCopy size={12} /> path
        </button>
        <button type="button" style={actionButton()} onClick={() => void download()}>
          <IconDownload size={12} /> download
        </button>
      </div>

      <div
        role="tablist"
        aria-label="Artifact inspector"
        class="atlas-scroll"
        style={{
          display: "flex",
          gap: "4px",
          padding: "0 12px 10px",
          overflow: "auto hidden",
          "border-bottom": "1px solid var(--color-border)",
          "flex-shrink": 0,
        }}
      >
        <For each={inspectorTabs}>
          {(item) => (
            <button
              id={`artifact-inspector-tab-${item}`}
              type="button"
              role="tab"
              aria-selected={tab() === item}
              aria-controls={`artifact-inspector-panel-${item}`}
              tabindex={tab() === item ? 0 : -1}
              onClick={() => setTab(item)}
              onKeyDown={(event) => move(event, item)}
              style={tabButton(tab() === item)}
            >
              {labels[item]}
              <Show when={!model().tabs[item].available}>
                <span aria-hidden="true" style={{ color: "var(--color-text-faint)", "font-size": "9px" }}>
                  ○
                </span>
              </Show>
            </button>
          )}
        </For>
      </div>

      <div
        id={`artifact-inspector-panel-${tab()}`}
        role="tabpanel"
        aria-labelledby={`artifact-inspector-tab-${tab()}`}
        class="atlas-scroll"
        style={{ flex: 1, "min-height": 0, overflow: "auto", padding: "14px", "box-sizing": "border-box" }}
      >
        <Show when={!records.loading} fallback={<Loading />}>
          <Switch>
            <Match when={tab() === "details"}>
              <Details data={model()} />
            </Match>
            <Match when={tab() === "code"}>
              <Show when={model().source !== undefined} fallback={<Empty state={model().tabs.code} icon="code" />}>
                <section style={card()}>
                  <Heading icon="code">Source</Heading>
                  <pre
                    class="atlas-scroll"
                    style={{
                      margin: 0,
                      "max-height": "460px",
                      overflow: "auto",
                      "font-family": FONT_CODE,
                      "font-size": "11px",
                      "line-height": 1.6,
                      color: "var(--color-text-muted)",
                      "white-space": "pre",
                    }}
                  >
                    {model().source}
                  </pre>
                </section>
              </Show>
            </Match>
            <Match when={tab() === "run"}>
              <Empty state={model().tabs.run} icon="run" />
            </Match>
            <Match when={tab() === "messages"}>
              <Empty state={model().tabs.messages} icon="messages" />
            </Match>
            <Match when={tab() === "environment"}>
              <Environment data={model()} />
            </Match>
            <Match when={tab() === "review"}>
              <Empty state={model().tabs.review} icon="review" />
            </Match>
            <Match when={tab() === "history"}>
              <History data={model()} />
            </Match>
          </Switch>
        </Show>
      </div>
    </section>
  )
}

function Details(props: { data: InspectorData }): JSX.Element {
  return (
    <div style={{ display: "grid", gap: "12px" }}>
      <section style={card()}>
        <Heading icon="details">Artifact</Heading>
        <Fact label="name" value={props.data.context.name} />
        <Fact label="kind" value={props.data.context.kind} />
        <Fact label="format" value={props.data.context.format.toUpperCase()} mono />
        <Fact label="path" value={props.data.context.path} mono />
        <Fact label="location" value={props.data.context.directory} mono />
        <Show when={props.data.context.scienceKind}>
          <Fact label="renderer" value={props.data.context.scienceKind!} mono />
        </Show>
      </section>
      <section style={card()}>
        <Heading icon="history">Provenance</Heading>
        <Show
          when={props.data.provenance}
          fallback={<p style={copyStyle()}>No Git provenance is recorded for this local artifact.</p>}
        >
          {(value) => (
            <>
              <Fact label="status" value={value().status} />
              <Fact label="branch" value={value().branch ?? "detached or unavailable"} mono />
              <Fact label="working tree" value={value().dirty ? "modified" : "clean"} />
              <Fact label="commit" value={value().commit?.sha.slice(0, 12) ?? "not committed"} mono />
            </>
          )}
        </Show>
      </section>
    </div>
  )
}

function Environment(props: { data: InspectorData }): JSX.Element {
  return (
    <Show when={props.data.tabs.environment.available} fallback={<Empty state={props.data.tabs.environment} icon="environment" />}>
      <div style={{ display: "grid", gap: "12px" }}>
        <List title="Environment specifications" items={props.data.environments} />
        <List title="Dependency locks" items={props.data.lockfiles} />
      </div>
    </Show>
  )
}

function History(props: { data: InspectorData }): JSX.Element {
  return (
    <Show when={props.data.provenance?.commit} fallback={<Empty state={props.data.tabs.history} icon="history" />}>
      {(version) => (
        <section style={card()}>
          <Heading icon="history">Latest recorded version</Heading>
          <Fact label="commit" value={version().sha} mono />
          <Fact label="author" value={`${version().author} <${version().email}>`} />
          <Fact label="date" value={new Date(version().date).toLocaleString()} />
          <Fact label="message" value={version().message} />
          <p style={copyStyle()}>
            This is the latest Git commit touching the file. Artifact-level branches and comparisons are not recorded yet.
          </p>
        </section>
      )}
    </Show>
  )
}

function List(props: { title: string; items: string[] }): JSX.Element {
  return (
    <section style={card()}>
      <Heading icon="environment">{props.title}</Heading>
      <Show when={props.items.length} fallback={<p style={copyStyle()}>None recorded.</p>}>
        <ul style={{ margin: 0, padding: "0 0 0 18px", display: "grid", gap: "6px" }}>
          <For each={props.items}>
            {(item) => <li style={{ "font-family": FONT_CODE, "font-size": "11px", color: "var(--color-text-muted)" }}>{item}</li>}
          </For>
        </ul>
      </Show>
    </section>
  )
}

function Empty(props: { state: InspectorState; icon: "code" | "run" | "messages" | "environment" | "review" | "history" }): JSX.Element {
  return (
    <div
      data-component="artifact-inspector-empty"
      style={{
        display: "grid",
        "justify-items": "start",
        gap: "10px",
        padding: "18px",
        border: "1px solid var(--color-border)",
        "border-radius": "8px",
        background: "var(--color-bg-subtle)",
      }}
    >
      <Heading icon={props.icon}>{props.state.title}</Heading>
      <p style={{ ...copyStyle(), margin: 0 }}>{props.state.detail}</p>
    </div>
  )
}

function Loading(): JSX.Element {
  return (
    <div data-component="artifact-inspector-loading" style={{ display: "grid", gap: "10px" }}>
      <For each={[1, 2, 3]}>
        {() => <div style={{ height: "58px", "border-radius": "7px", background: "var(--color-bg-subtle)" }} />}
      </For>
    </div>
  )
}

function Heading(props: {
  icon: "details" | "code" | "run" | "messages" | "environment" | "review" | "history"
  children: JSX.Element
}): JSX.Element {
  const icons = {
    details: IconFile,
    code: IconBraces,
    run: IconClock,
    messages: IconMessageSquare,
    environment: IconSettings,
    review: IconFlask,
    history: IconBookOpen,
  }
  const Icon = icons[props.icon]
  return (
    <h3
      style={{
        margin: 0,
        display: "flex",
        "align-items": "center",
        gap: "7px",
        "font-family": FONT_SANS,
        "font-size": "12px",
        "font-weight": 650,
        color: "var(--color-text)",
      }}
    >
      <Icon size={13} strokeWidth={1.5} />
      {props.children}
    </h3>
  )
}

function Fact(props: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div style={{ display: "grid", "grid-template-columns": "78px minmax(0, 1fr)", gap: "10px", "align-items": "start" }}>
      <span style={{ "font-family": FONT_SANS, "font-size": "11px", color: "var(--color-text-faint)" }}>{props.label}</span>
      <span
        title={props.value}
        style={{
          "font-family": props.mono ? FONT_CODE : FONT_SANS,
          "font-size": "11px",
          "line-height": 1.45,
          color: "var(--color-text-muted)",
          overflow: "hidden",
          "text-overflow": "ellipsis",
          "white-space": "nowrap",
        }}
      >
        {props.value}
      </span>
    </div>
  )
}

function card(): JSX.CSSProperties {
  return {
    display: "grid",
    gap: "9px",
    padding: "13px",
    border: "1px solid var(--color-border)",
    "border-radius": "8px",
    background: "var(--color-bg-subtle)",
  }
}

function copyStyle(): JSX.CSSProperties {
  return {
    margin: 0,
    "font-family": FONT_SANS,
    "font-size": "11px",
    "line-height": 1.55,
    color: "var(--color-text-muted)",
  }
}

function actionButton(primary = false): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "6px",
    padding: "7px 8px",
    "border-radius": "6px",
    border: primary ? "1px solid var(--color-text)" : "1px solid var(--color-border)",
    background: primary ? "var(--color-text)" : "var(--color-bg-subtle)",
    color: primary ? "var(--color-bg)" : "var(--color-text-muted)",
    "font-family": FONT_SANS,
    "font-size": "11px",
    "font-weight": primary ? 650 : 500,
  }
}

function tabButton(active: boolean): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "inline-flex",
    "align-items": "center",
    gap: "5px",
    padding: "6px 8px",
    "border-radius": "5px",
    background: active ? "var(--color-accent-subtle)" : "transparent",
    color: active ? "var(--color-text)" : "var(--color-text-muted)",
    "font-family": FONT_SANS,
    "font-size": "11px",
    "font-weight": active ? 650 : 500,
    "white-space": "nowrap",
  }
}

function iconButton(): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    width: "28px",
    height: "28px",
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    "border-radius": "5px",
    color: "var(--color-text-muted)",
  }
}

function quietButton(): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    padding: "5px 8px",
    "border-radius": "5px",
    "font-family": FONT_SANS,
    "font-size": "11px",
    color: "var(--color-text-muted)",
  }
}

export default ArtifactInspector
