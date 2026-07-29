import { For, Show, createMemo, createResource, createSignal, type JSX } from "solid-js"
import { usePlatform } from "@/context/platform"
import { usePrompt } from "@/context/prompt"
import { useSDK } from "@/context/sdk"
import { centerTabs } from "@/atlas/store/centerTabs"
import { uiStore } from "@/atlas/store/ui"
import { toast } from "@/atlas/Toast"
import {
  IconArchive,
  IconBookOpen,
  IconCopy,
  IconDownload,
  IconFile,
  IconFlask,
  IconRefresh,
  IconSearch,
  IconX,
} from "@/atlas/shared/Icon"
import { FONT_CODE, FONT_MONO, FONT_SANS } from "@/styles/tokens"
import {
  artifactActions,
  filterArtifacts,
  formatArtifactKind,
  groupArtifacts,
  normalizeArtifacts,
  sortArtifacts,
  type ArtifactInfo,
  type ArtifactKind,
  type ArtifactSort,
} from "./model"

interface Provenance {
  path: string
  tracked: boolean
  dirty: boolean
  status: string
  branch?: string
  commit?: {
    sha: string
    author: string
    email: string
    date: string
    message: string
  }
}

interface Audit {
  generated_at: string
  score: number
  status: "ready" | "warnings" | "blocked"
  lockfiles: string[]
  environments: string[]
  notebooks: { total: number; valid: number; invalid: string[] }
  artifacts: { total: number; nonempty: number; bytes: number }
  checks: Array<{
    id: string
    label: string
    status: "pass" | "warn" | "fail"
    detail: string
    weight: number
  }>
}

type PublicationFormat = "html" | "pdf" | "docx" | "latex" | "pptx"

interface PublicationCapabilities {
  pandoc: boolean
  pdf_engine?: string
  formats: Record<PublicationFormat, boolean>
}

export function ArtifactGallery(props: { directory: string; onOpen: (path: string) => void }): JSX.Element {
  const sdk = useSDK()
  const platform = usePlatform()
  const prompt = usePrompt()
  const [query, setQuery] = createSignal("")
  const [kind, setKind] = createSignal<ArtifactKind | "all">("all")
  const [sort, setSort] = createSignal<ArtifactSort>("recent")
  const [selected, setSelected] = createSignal<string>()
  const [auditOpen, setAuditOpen] = createSignal(false)
  const [refresh, setRefresh] = createSignal(0)
  const request = () => platform.fetch ?? fetch
  const url = (route: string, path?: string) =>
    `${sdk.url.replace(/\/$/, "")}${route}?directory=${encodeURIComponent(props.directory)}${path ? `&path=${encodeURIComponent(path)}` : ""}`

  const [data] = createResource(
    () => [props.directory, refresh()] as const,
    async () => {
      const response = await request()(url("/file/artifacts"))
      if (!response.ok) throw new Error(`artifact scan failed (${response.status})`)
      return normalizeArtifacts(await response.json())
    },
  )
  const [audit, auditApi] = createResource(
    () => [props.directory, refresh()] as const,
    async () => {
      const response = await request()(url("/file/reproducibility"))
      if (!response.ok) throw new Error(`reproducibility audit failed (${response.status})`)
      return (await response.json()) as Audit
    },
  )
  const rows = () => data.latest ?? []
  const groups = createMemo(() => groupArtifacts(rows()))
  const filtered = createMemo(() => sortArtifacts(filterArtifacts(rows(), kind(), query()), sort()))
  const artifact = createMemo(() => rows().find((item) => item.path === selected()))
  const totalSize = createMemo(() => rows().reduce((total, item) => total + item.size, 0))

  const download = async (item: ArtifactInfo) => {
    const response = await request()(url("/file/raw", item.path))
    if (!response.ok) {
      toast.error("download failed", `${response.status}`)
      return
    }
    const object = URL.createObjectURL(await response.blob())
    const anchor = document.createElement("a")
    anchor.href = object
    anchor.download = item.name
    anchor.click()
    URL.revokeObjectURL(object)
  }

  const copy = async (value: string, label: string) => {
    await navigator.clipboard?.writeText(value)
    toast.success("copied", label)
  }

  const attach = (item: ArtifactInfo) => {
    prompt.context.add({ type: "file", path: item.path })
    centerTabs.showChat()
    toast.success("added to context", item.name)
  }

  const act = (item: ArtifactInfo, instruction: string) => {
    prompt.context.add({ type: "file", path: item.path })
    uiStore.setPrefill(instruction)
    centerTabs.showChat()
  }

  const manifest = async () => {
    const id = toast.info("building integrity manifest", "Hashing local research artifacts…")
    const response = await request()(url("/file/manifest")).catch((error) => {
      toast.error("manifest failed", error instanceof Error ? error.message : String(error))
      return undefined
    })
    toast.dismiss(id)
    if (!response) return
    if (!response.ok) {
      toast.error("manifest failed", `${response.status}`)
      return
    }
    const object = URL.createObjectURL(await response.blob())
    const anchor = document.createElement("a")
    anchor.href = object
    anchor.download = "openscience-artifact-manifest.json"
    anchor.click()
    URL.revokeObjectURL(object)
    toast.success("integrity manifest ready", `${rows().length} artifacts`)
  }

  const publish = async (item: ArtifactInfo, format: PublicationFormat) => {
    const id = toast.info(`exporting ${format.toUpperCase()}`, item.name)
    const response = await request()(url("/file/publication"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: item.path, format }),
    }).catch((error) => {
      toast.error("publication export failed", error instanceof Error ? error.message : String(error))
      return undefined
    })
    toast.dismiss(id)
    if (!response) return
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      toast.error("publication export failed", detail || `${response.status}`)
      return
    }
    const result = (await response.json()) as { path: string; format: PublicationFormat; size: number }
    toast.success(`${format.toUpperCase()} ready`, result.path)
    if (!["docx", "pptx"].includes(format)) {
      props.onOpen(result.path)
      return
    }
    const raw = await request()(url("/file/raw", result.path))
    if (!raw.ok) return
    const object = URL.createObjectURL(await raw.blob())
    const anchor = document.createElement("a")
    anchor.href = object
    anchor.download = result.path.split("/").pop() || `report.${format}`
    anchor.click()
    URL.revokeObjectURL(object)
  }

  return (
    <div
      data-component="artifact-gallery"
      style={{
        flex: 1,
        "min-height": 0,
        display: "flex",
        "flex-direction": "column",
        background: "var(--color-bg-subtle)",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 16px 12px",
          border: "0",
          "border-bottom": "1px solid var(--color-border)",
          background: "var(--color-bg)",
          display: "grid",
          gap: "12px",
        }}
      >
        <div style={{ display: "flex", "align-items": "center", gap: "10px" }}>
          <div style={{ flex: 1, "min-width": 0 }}>
            <div style={{ display: "flex", "align-items": "baseline", gap: "8px" }}>
              <strong style={{ "font-family": FONT_SANS, "font-size": "14px", color: "var(--color-text)" }}>
                Research artifacts
              </strong>
              <span style={muted()}>{rows().length.toLocaleString()} discovered locally</span>
            </div>
            <Show when={rows().length}>
              <div style={{ ...muted(), "margin-top": "3px" }}>
                {groups().length} categories · {formatBytes(totalSize())} · nothing uploaded
              </div>
            </Show>
          </div>
          <div style={search()}>
            <IconSearch size={11} strokeWidth={1.5} />
            <input
              value={query()}
              onInput={(event) => setQuery(event.currentTarget.value)}
              placeholder="find an artifact…"
              aria-label="Find an artifact"
              style={{
                all: "unset",
                width: "180px",
                "font-family": FONT_SANS,
                "font-size": "10px",
                color: "var(--color-text)",
              }}
            />
          </div>
          <select
            aria-label="Sort artifacts"
            value={sort()}
            onChange={(event) => setSort(event.currentTarget.value as ArtifactSort)}
            style={select()}
          >
            <option value="recent">recent first</option>
            <option value="name">name</option>
            <option value="size">largest first</option>
          </select>
          <button
            type="button"
            title="refresh artifacts"
            aria-label="Refresh artifacts"
            style={actionButton()}
            onClick={() => setRefresh((value) => value + 1)}
          >
            <IconRefresh size={12} strokeWidth={1.5} /> refresh
          </button>
        </div>
        <div class="atlas-scroll" style={{ display: "flex", gap: "5px", overflow: "auto hidden" }}>
          <button type="button" style={filterButton(kind() === "all")} onClick={() => setKind("all")}>
            all <span>{rows().length}</span>
          </button>
          <For each={groups()}>
            {(group) => (
              <button type="button" style={filterButton(kind() === group.kind)} onClick={() => setKind(group.kind)}>
                {formatArtifactKind(group.kind)} <span>{group.count}</span>
              </button>
            )}
          </For>
        </div>
        <button
          type="button"
          data-component="reproducibility-score"
          data-status={audit.latest?.status ?? "loading"}
          onClick={() => setAuditOpen((value) => !value)}
          style={auditSummary(audit.latest?.status)}
        >
          <span style={auditScore(audit.latest?.status)}>
            <Show when={!audit.loading} fallback="··">
              {audit.latest?.score ?? 0}
            </Show>
          </span>
          <span style={{ display: "grid", gap: "2px", flex: 1, "text-align": "left" }}>
            <strong>Reproducibility</strong>
            <small>
              {audit.error
                ? "audit unavailable"
                : audit.latest?.status === "ready"
                  ? "environment, notebooks, and code are ready"
                  : audit.latest?.status === "blocked"
                    ? "blocking gaps need attention"
                    : "review the remaining warnings"}
            </small>
          </span>
          <span style={{ "font-family": FONT_MONO, "font-size": "9px", color: "var(--color-text-faint)" }}>
            {auditOpen() ? "hide" : "details"}
          </span>
        </button>
        <Show when={auditOpen() && audit.latest}>
          {(value) => (
            <div data-component="reproducibility-audit" style={auditPanel()}>
              <div style={{ display: "grid", gap: "6px" }}>
                <For each={value().checks}>
                  {(check) => (
                    <div style={auditCheck()}>
                      <span
                        style={{
                          color:
                            check.status === "pass"
                              ? "var(--color-success)"
                              : check.status === "fail"
                                ? "var(--color-error)"
                                : "var(--color-warning)",
                        }}
                      >
                        {check.status === "pass" ? "●" : check.status === "fail" ? "×" : "◇"}
                      </span>
                      <strong>{check.label}</strong>
                      <span>{check.detail}</span>
                    </div>
                  )}
                </For>
              </div>
              <div style={{ display: "flex", "align-items": "center", gap: "6px" }}>
                <button type="button" style={actionButton()} onClick={() => void auditApi.refetch()}>
                  <IconRefresh size={11} /> run again
                </button>
                <button type="button" style={primaryButton()} onClick={() => void manifest()}>
                  <IconDownload size={11} /> checksum manifest
                </button>
              </div>
            </div>
          )}
        </Show>
      </div>

      <Show
        when={!data.loading || data.latest}
        fallback={
          <div style={empty()}>
            <span style={{ "font-family": FONT_MONO, "font-size": "11px", color: "var(--color-text-faint)" }}>
              indexing project artifacts…
            </span>
          </div>
        }
      >
        <Show
          when={!data.error}
          fallback={
            <div style={empty()}>
              <IconArchive size={22} strokeWidth={1.3} />
              <strong style={emptyTitle()}>Artifact scan unavailable</strong>
              <span style={muted()}>{data.error instanceof Error ? data.error.message : String(data.error)}</span>
              <button type="button" style={actionButton()} onClick={() => setRefresh((value) => value + 1)}>
                retry
              </button>
            </div>
          }
        >
          <Show
            when={filtered().length}
            fallback={
              <div style={empty()}>
                <IconArchive size={24} strokeWidth={1.2} />
                <strong style={emptyTitle()}>
                  {rows().length ? "No matching artifacts" : "No research artifacts yet"}
                </strong>
                <span style={{ ...muted(), "max-width": "430px", "line-height": 1.6 }}>
                  {rows().length
                    ? "Try another search or category."
                    : "Notebooks, datasets, figures, reports, structures, sequences, spectra, and model files appear here automatically."}
                </span>
              </div>
            }
          >
            <div style={{ flex: 1, "min-height": 0, display: "flex", overflow: "hidden" }}>
              <div
                class="atlas-scroll"
                style={{
                  flex: 1,
                  "min-width": 0,
                  overflow: "auto",
                  padding: "14px",
                }}
              >
                <div
                  style={{
                    display: "grid",
                    "grid-template-columns": "repeat(auto-fill, minmax(185px, 1fr))",
                    gap: "9px",
                    "align-content": "start",
                  }}
                >
                  <For each={filtered()}>
                    {(item) => (
                      <ArtifactCard
                        item={item}
                        active={selected() === item.path}
                        preview={url("/file/raw", item.path)}
                        onSelect={() => setSelected(item.path)}
                        onOpen={() => props.onOpen(item.path)}
                      />
                    )}
                  </For>
                </div>
              </div>
              <Show when={artifact()}>
                {(item) => (
                  <ArtifactDetail
                    item={item()}
                    directory={props.directory}
                    url={url}
                    request={request()}
                    onClose={() => setSelected(undefined)}
                    onOpen={() => props.onOpen(item().path)}
                    onDownload={() => void download(item())}
                    onCopy={() => void copy(item().path, item().path)}
                    onAttach={() => attach(item())}
                    onAction={(instruction) => act(item(), instruction)}
                    onPublish={(format) => void publish(item(), format)}
                  />
                )}
              </Show>
            </div>
          </Show>
        </Show>
      </Show>
    </div>
  )
}

function ArtifactCard(props: {
  item: ArtifactInfo
  active: boolean
  preview: string
  onSelect: () => void
  onOpen: () => void
}): JSX.Element {
  return (
    <button
      type="button"
      data-artifact={props.item.path}
      aria-label={`${props.item.name} artifact`}
      onClick={props.onSelect}
      onDblClick={props.onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter") props.onOpen()
      }}
      style={{
        all: "unset",
        cursor: "pointer",
        display: "grid",
        "grid-template-rows": "86px auto",
        border: `1px solid ${props.active ? "var(--color-accent)" : "var(--color-border)"}`,
        "border-radius": "8px",
        background: "var(--color-bg)",
        overflow: "hidden",
        "box-shadow": props.active ? "0 0 0 1px color-mix(in srgb, var(--color-accent) 20%, transparent)" : "none",
        transition: "border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease",
      }}
    >
      <ArtifactVisual item={props.item} preview={props.preview} />
      <div style={{ display: "grid", gap: "7px", padding: "10px 11px" }}>
        <div style={{ display: "flex", gap: "7px", "align-items": "center", "min-width": 0 }}>
          <span style={{ color: accent(props.item.kind), display: "inline-flex" }}>
            <KindIcon kind={props.item.kind} size={12} />
          </span>
          <strong
            title={props.item.path}
            style={{
              flex: 1,
              "min-width": 0,
              overflow: "hidden",
              "text-overflow": "ellipsis",
              "white-space": "nowrap",
              "font-family": FONT_SANS,
              "font-size": "11px",
              "font-weight": 550,
              color: "var(--color-text)",
            }}
          >
            {props.item.name}
          </strong>
        </div>
        <div style={{ display: "flex", gap: "5px", "align-items": "center" }}>
          <span style={badge(accent(props.item.kind))}>{props.item.format.toUpperCase()}</span>
          <span style={{ ...muted(), flex: 1 }}>{formatArtifactKind(props.item.kind)}</span>
          <span style={muted()}>{formatBytes(props.item.size)}</span>
        </div>
      </div>
    </button>
  )
}

function ArtifactVisual(props: { item: ArtifactInfo; preview: string }): JSX.Element {
  const image = () =>
    props.item.kind === "figure" && ["png", "jpg", "jpeg", "svg", "webp", "gif"].includes(props.item.format)
  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        background: `color-mix(in srgb, ${accent(props.item.kind)} 8%, var(--color-bg-subtle))`,
        border: "0",
        "border-bottom": "1px solid var(--color-border)",
      }}
    >
      <Show
        when={image()}
        fallback={<ArtifactPlaceholder item={props.item} />}
      >
        <img
          data-preview-source="file"
          data-preview-kind="figure"
          src={props.preview}
          alt={`Preview of ${props.item.name}`}
          loading="lazy"
          style={{ width: "100%", height: "100%", "object-fit": "cover", display: "block" }}
        />
      </Show>
      <span
        style={{
          position: "absolute",
          top: "10px",
          left: "11px",
          "font-family": FONT_MONO,
          "font-size": "9px",
          "font-weight": 650,
          color: accent(props.item.kind),
          "letter-spacing": "0.08em",
        }}
      >
        {props.item.kind.toUpperCase()}
      </span>
      <span
        style={{
          position: "absolute",
          right: "10px",
          bottom: "8px",
          color: `color-mix(in srgb, ${accent(props.item.kind)} 70%, var(--color-text-faint))`,
          opacity: 0.8,
        }}
      >
        <KindIcon kind={props.item.kind} size={20} />
      </span>
    </div>
  )
}

function ArtifactPlaceholder(props: { item: ArtifactInfo }): JSX.Element {
  const copy = () => {
    if (props.item.kind === "notebook") return ["Notebook", "Executable cells"]
    if (props.item.kind === "dataset") return ["Tabular data", props.item.format.toUpperCase()]
    if (props.item.kind === "report")
      return props.item.format === "pdf" ? ["PDF document", "Open for page preview"] : ["Document", "Rendered on open"]
    if (props.item.kind === "structure") return ["Molecular structure", "Open for interactive 3D"]
    if (props.item.kind === "sequence") return ["Biological sequence", "Open for sequence inspection"]
    if (props.item.kind === "genomics") return ["Genomic data", "Open for records and tracks"]
    if (props.item.kind === "spectrum") return ["Mass spectrum", "Open for spectral inspection"]
    if (props.item.kind === "model") return ["Model artifact", "Inspect inputs and provenance"]
    if (props.item.kind === "archive") return ["Archive", "Open for a safe inventory"]
    return ["Figure", `${props.item.format.toUpperCase()} preview unavailable`]
  }
  return (
    <div
      data-preview-source="placeholder"
      data-preview-kind={props.item.kind}
      style={{
        position: "absolute",
        inset: 0,
        display: "grid",
        "place-content": "center",
        "justify-items": "center",
        gap: "5px",
        padding: "10px",
        "text-align": "center",
      }}
    >
      <span style={{ color: accent(props.item.kind), opacity: 0.78 }}>
        <KindIcon kind={props.item.kind} size={21} />
      </span>
      <strong style={{ "font-family": FONT_SANS, "font-size": "10px", color: "var(--color-text)" }}>
        {copy()[0]}
      </strong>
      <span style={{ "font-family": FONT_MONO, "font-size": "8px", color: "var(--color-text-faint)" }}>
        {copy()[1]}
      </span>
    </div>
  )
}

function ArtifactDetail(props: {
  item: ArtifactInfo
  directory: string
  url: (route: string, path?: string) => string
  request: typeof fetch
  onClose: () => void
  onOpen: () => void
  onDownload: () => void
  onCopy: () => void
  onAttach: () => void
  onAction: (instruction: string) => void
  onPublish: (format: PublicationFormat) => void
}): JSX.Element {
  const [provenance] = createResource(
    () => [props.directory, props.item.path] as const,
    async () => {
      const response = await props.request(props.url("/file/provenance", props.item.path))
      if (!response.ok) throw new Error(`${response.status}`)
      return (await response.json()) as Provenance
    },
  )
  const publication = () => props.item.kind === "report" && ["md", "markdown"].includes(props.item.format.toLowerCase())
  const [capabilities] = createResource(publication, async () => {
    const response = await props.request(props.url("/file/publication/capabilities"))
    if (!response.ok) throw new Error(`${response.status}`)
    return (await response.json()) as PublicationCapabilities
  })
  return (
    <aside
      data-component="artifact-detail"
      style={{
        width: "310px",
        "max-width": "42%",
        "flex-shrink": 0,
        border: "0",
        "border-left": "1px solid var(--color-border)",
        background: "var(--color-bg)",
        display: "flex",
        "flex-direction": "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          "align-items": "center",
          gap: "8px",
          padding: "11px 12px",
          "border-bottom": "1px solid var(--color-border)",
        }}
      >
        <span style={{ color: accent(props.item.kind), display: "inline-flex" }}>
          <KindIcon kind={props.item.kind} size={14} />
        </span>
        <strong
          title={props.item.name}
          style={{
            flex: 1,
            "min-width": 0,
            overflow: "hidden",
            "text-overflow": "ellipsis",
            "white-space": "nowrap",
            "font-family": FONT_SANS,
            "font-size": "11px",
            color: "var(--color-text)",
          }}
        >
          {props.item.name}
        </strong>
        <button type="button" title="close artifact details" style={iconButton()} onClick={props.onClose}>
          <IconX size={12} strokeWidth={1.5} />
        </button>
      </div>
      <div
        class="atlas-scroll"
        style={{ flex: 1, overflow: "auto", padding: "12px", display: "grid", gap: "12px", "align-content": "start" }}
      >
        <div style={{ display: "grid", "grid-template-columns": "1fr 1fr", gap: "7px" }}>
          <button type="button" style={primaryButton()} onClick={props.onOpen}>
            <IconBookOpen size={11} /> open
          </button>
          <button type="button" style={actionButton()} onClick={props.onAttach}>
            <IconFlask size={11} /> add to context
          </button>
          <button type="button" style={actionButton()} onClick={props.onDownload}>
            <IconDownload size={11} /> download
          </button>
          <button type="button" style={actionButton()} onClick={props.onCopy}>
            <IconCopy size={11} /> copy path
          </button>
        </div>
        <Section title="File">
          <Fact label="path" value={props.item.path} mono />
          <Fact label="kind" value={formatArtifactKind(props.item.kind)} />
          <Fact label="format" value={props.item.format.toUpperCase()} mono />
          <Fact label="size" value={formatBytes(props.item.size)} />
          <Fact label="modified" value={new Date(props.item.modified).toLocaleString()} />
        </Section>
        <Section title="What can I do with this file?">
          <div style={{ display: "grid", gap: "6px" }}>
            <For each={artifactActions(props.item)}>
              {(action) => (
                <button type="button" style={scienceAction()} onClick={() => props.onAction(action.prompt)}>
                  <span style={{ color: accent(props.item.kind), display: "inline-flex" }}>
                    <IconFlask size={12} />
                  </span>
                  <span style={{ display: "grid", gap: "2px", "text-align": "left" }}>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                </button>
              )}
            </For>
          </div>
        </Section>
        <Show when={publication()}>
          <Section title="Publication exports">
            <div style={{ display: "grid", gap: "8px" }}>
              <span style={{ ...muted(), "line-height": 1.5 }}>
                HTML is built in. Pandoc adds timestamped PDF, Word, LaTeX, and PowerPoint outputs.
              </span>
              <Show when={capabilities.latest} fallback={<span style={muted()}>checking local export tools…</span>}>
                <div style={{ display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))", gap: "5px" }}>
                  <For each={["html", "pdf", "docx", "latex", "pptx"] as PublicationFormat[]}>
                    {(format) => (
                      <button
                        type="button"
                        style={exportButton(capabilities.latest?.formats[format] ?? false)}
                        disabled={!capabilities.latest?.formats[format]}
                        title={
                          format === "pdf" && !capabilities.latest?.formats.pdf
                            ? "PDF needs a local TeX or Typst engine"
                            : `export ${format}`
                        }
                        onClick={() => props.onPublish(format)}
                      >
                        <IconDownload size={10} />
                        {format === "pptx" ? "PowerPoint" : format === "docx" ? "Word" : format.toUpperCase()}
                      </button>
                    )}
                  </For>
                </div>
                <Show when={capabilities.latest?.pdf_engine}>
                  <span style={muted()}>PDF engine · {capabilities.latest?.pdf_engine}</span>
                </Show>
                <Show when={!capabilities.latest?.pandoc}>
                  <span style={{ ...muted(), color: "var(--color-warning)" }}>
                    Install Pandoc to unlock PDF, Word, LaTeX, and PowerPoint.
                  </span>
                </Show>
              </Show>
            </div>
          </Section>
        </Show>
        <Section title="Provenance">
          <Show when={!provenance.loading} fallback={<span style={muted()}>reading Git history…</span>}>
            <Show when={provenance()} fallback={<span style={muted()}>local file · no Git provenance</span>}>
              {(value) => (
                <>
                  <Show when={value().status === "local"}>
                    <span style={muted()}>local file · no Git provenance</span>
                  </Show>
                  <div style={{ display: "flex", gap: "6px", "align-items": "center", "margin-bottom": "9px" }}>
                    <Status status={value().status} />
                    <Show when={value().branch}>
                      <span style={badge("var(--color-text-faint)")}>{value().branch}</span>
                    </Show>
                  </div>
                  <Show when={value().commit} fallback={<span style={muted()}>Not committed yet</span>}>
                    {(commit) => (
                      <div style={{ display: "grid", gap: "6px" }}>
                        <strong
                          style={{
                            "font-family": FONT_SANS,
                            "font-size": "10px",
                            color: "var(--color-text)",
                            "line-height": 1.4,
                          }}
                        >
                          {commit().message}
                        </strong>
                        <span style={muted()}>
                          {commit().author} · {new Date(commit().date).toLocaleString()}
                        </span>
                        <button
                          type="button"
                          style={shaButton()}
                          onClick={() => void navigator.clipboard?.writeText(commit().sha)}
                          title="copy commit SHA"
                        >
                          {commit().sha.slice(0, 9)}
                        </button>
                      </div>
                    )}
                  </Show>
                </>
              )}
            </Show>
          </Show>
        </Section>
        <Section title="Reproducibility">
          <div style={{ display: "grid", gap: "8px" }}>
            <Check
              ok={!provenance()?.dirty}
              label={provenance()?.dirty ? "working copy has changes" : "working copy matches Git"}
            />
            <Check
              ok={Boolean(provenance()?.commit)}
              label={provenance()?.commit ? "commit provenance available" : "not committed"}
            />
            <Check ok={props.item.size > 0} label="artifact is non-empty" />
          </div>
        </Section>
      </div>
    </aside>
  )
}

function Section(props: { title: string; children: JSX.Element }): JSX.Element {
  return (
    <section
      style={{
        padding: "11px",
        border: "1px solid var(--color-border)",
        "border-radius": "7px",
        background: "var(--color-bg-subtle)",
      }}
    >
      <h3
        style={{
          margin: "0 0 10px",
          "font-family": FONT_MONO,
          "font-size": "9px",
          "font-weight": 600,
          color: "var(--color-text-faint)",
          "text-transform": "uppercase",
          "letter-spacing": "0.07em",
        }}
      >
        {props.title}
      </h3>
      <div style={{ display: "grid", gap: "7px" }}>{props.children}</div>
    </section>
  )
}

function Fact(props: { label: string; value: string; mono?: boolean }): JSX.Element {
  return (
    <div style={{ display: "grid", "grid-template-columns": "68px 1fr", gap: "7px", "align-items": "baseline" }}>
      <span style={muted()}>{props.label}</span>
      <span
        title={props.value}
        style={{
          "font-family": props.mono ? FONT_CODE : FONT_SANS,
          "font-size": "9px",
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

function Check(props: { ok: boolean; label: string }): JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        gap: "7px",
        "align-items": "center",
        "font-family": FONT_SANS,
        "font-size": "9px",
        color: "var(--color-text-muted)",
      }}
    >
      <span style={{ color: props.ok ? "#4ca56a" : "#b07a00" }}>{props.ok ? "●" : "◇"}</span>
      {props.label}
    </div>
  )
}

function Status(props: { status: string }): JSX.Element {
  const clean = props.status === "clean"
  return (
    <span
      style={{
        ...badge(clean ? "#4ca56a" : "#b07a00"),
        background: clean
          ? "color-mix(in srgb, #4ca56a 9%, transparent)"
          : "color-mix(in srgb, #d4a72c 9%, transparent)",
      }}
    >
      {props.status}
    </span>
  )
}

function KindIcon(props: { kind: ArtifactKind; size: number }): JSX.Element {
  if (props.kind === "notebook" || props.kind === "report") return <IconBookOpen size={props.size} strokeWidth={1.5} />
  if (props.kind === "archive") return <IconArchive size={props.size} strokeWidth={1.5} />
  if (["structure", "sequence", "genomics", "spectrum"].includes(props.kind))
    return <IconFlask size={props.size} strokeWidth={1.5} />
  return <IconFile size={props.size} strokeWidth={1.5} />
}

function accent(kind: ArtifactKind): string {
  const colors: Record<ArtifactKind, string> = {
    notebook: "#e07836",
    dataset: "#2f8f83",
    figure: "#825dc7",
    report: "#d15151",
    structure: "#2786b8",
    sequence: "#5a9b4d",
    genomics: "#3b7f67",
    spectrum: "#b07822",
    model: "#6977b8",
    archive: "#7e7b75",
  }
  return colors[kind]
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB", "TB"]
  const order = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)) - 1)
  const value = bytes / 1024 ** (order + 1)
  return `${Math.round(value * 10) / 10} ${units[order]}`
}

function search(): JSX.CSSProperties {
  return {
    display: "flex",
    "align-items": "center",
    gap: "6px",
    padding: "6px 8px",
    border: "1px solid var(--color-border)",
    "border-radius": "5px",
    background: "var(--color-bg-subtle)",
    color: "var(--color-text-faint)",
  }
}

function select(): JSX.CSSProperties {
  return {
    padding: "6px 8px",
    border: "1px solid var(--color-border)",
    "border-radius": "5px",
    background: "var(--color-bg-subtle)",
    color: "var(--color-text-muted)",
    "font-family": FONT_SANS,
    "font-size": "10px",
    outline: "none",
  }
}

function filterButton(active: boolean): JSX.CSSProperties {
  return {
    padding: "4px 8px",
    border: `1px solid ${active ? "var(--color-border-strong)" : "var(--color-border)"}`,
    "border-radius": "99px",
    background: active ? "var(--color-bg-subtle)" : "transparent",
    color: active ? "var(--color-text)" : "var(--color-text-muted)",
    "font-family": FONT_SANS,
    "font-size": "9px",
    cursor: "pointer",
    "white-space": "nowrap",
  }
}

function badge(color: string): JSX.CSSProperties {
  return {
    width: "fit-content",
    padding: "2px 6px",
    "border-radius": "4px",
    background: `color-mix(in srgb, ${color} 10%, transparent)`,
    color,
    "font-family": FONT_MONO,
    "font-size": "8px",
    "font-weight": 600,
    "letter-spacing": "0.04em",
    "white-space": "nowrap",
  }
}

function muted(): JSX.CSSProperties {
  return { "font-family": FONT_MONO, "font-size": "9px", color: "var(--color-text-faint)" }
}

function iconButton(): JSX.CSSProperties {
  return {
    all: "unset",
    width: "27px",
    height: "27px",
    display: "grid",
    "place-items": "center",
    "border-radius": "4px",
    cursor: "pointer",
    color: "var(--color-text-faint)",
  }
}

function actionButton(): JSX.CSSProperties {
  return {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "5px",
    padding: "6px 8px",
    border: "1px solid var(--color-border)",
    "border-radius": "5px",
    background: "var(--color-bg)",
    color: "var(--color-text-muted)",
    "font-family": FONT_SANS,
    "font-size": "9px",
    cursor: "pointer",
  }
}

function primaryButton(): JSX.CSSProperties {
  return {
    ...actionButton(),
    background: "var(--color-text)",
    color: "var(--color-bg)",
    border: "1px solid var(--color-text)",
  }
}

function auditSummary(status?: Audit["status"]): JSX.CSSProperties {
  const color =
    status === "ready" ? "var(--color-success)" : status === "blocked" ? "var(--color-error)" : "var(--color-warning)"
  return {
    all: "unset",
    cursor: "pointer",
    display: "flex",
    "align-items": "center",
    gap: "9px",
    padding: "8px 10px",
    border: "1px solid var(--color-border)",
    "border-radius": "7px",
    background: `color-mix(in srgb, ${color} 4%, var(--color-bg-subtle))`,
    color: "var(--color-text)",
  }
}

function auditScore(status?: Audit["status"]): JSX.CSSProperties {
  const color =
    status === "ready" ? "var(--color-success)" : status === "blocked" ? "var(--color-error)" : "var(--color-warning)"
  return {
    width: "31px",
    height: "31px",
    display: "grid",
    "place-items": "center",
    "border-radius": "50%",
    border: `1px solid color-mix(in srgb, ${color} 40%, var(--color-border))`,
    background: `color-mix(in srgb, ${color} 9%, transparent)`,
    color,
    "font-family": FONT_MONO,
    "font-size": "10px",
    "font-weight": 700,
  }
}

function auditPanel(): JSX.CSSProperties {
  return {
    display: "grid",
    "grid-template-columns": "minmax(0, 1fr) auto",
    gap: "12px",
    padding: "10px",
    border: "1px solid var(--color-border)",
    "border-radius": "7px",
    background: "var(--color-bg-subtle)",
  }
}

function auditCheck(): JSX.CSSProperties {
  return {
    display: "grid",
    "grid-template-columns": "12px 150px minmax(0, 1fr)",
    gap: "7px",
    "align-items": "baseline",
    "font-family": FONT_SANS,
    "font-size": "9px",
    color: "var(--color-text-muted)",
  }
}

function scienceAction(): JSX.CSSProperties {
  return {
    all: "unset",
    cursor: "pointer",
    display: "grid",
    "grid-template-columns": "18px minmax(0, 1fr)",
    gap: "6px",
    padding: "7px",
    "border-radius": "5px",
    border: "1px solid var(--color-border)",
    background: "var(--color-bg)",
    color: "var(--color-text)",
  }
}

function exportButton(enabled: boolean): JSX.CSSProperties {
  return {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    gap: "5px",
    padding: "6px 7px",
    border: "1px solid var(--color-border)",
    "border-radius": "5px",
    background: "var(--color-bg)",
    color: enabled ? "var(--color-text-muted)" : "var(--color-text-faint)",
    opacity: enabled ? 1 : 0.45,
    "font-family": FONT_SANS,
    "font-size": "9px",
    cursor: enabled ? "pointer" : "not-allowed",
  }
}

function shaButton(): JSX.CSSProperties {
  return {
    width: "fit-content",
    padding: "3px 6px",
    border: "1px solid var(--color-border)",
    "border-radius": "4px",
    background: "var(--color-bg)",
    color: "var(--color-text-faint)",
    "font-family": FONT_CODE,
    "font-size": "9px",
    cursor: "copy",
  }
}

function empty(): JSX.CSSProperties {
  return {
    flex: 1,
    display: "grid",
    "place-items": "center",
    "align-content": "center",
    gap: "8px",
    padding: "40px 24px",
    color: "var(--color-text-faint)",
    "text-align": "center",
  }
}

function emptyTitle(): JSX.CSSProperties {
  return { "font-family": FONT_SANS, "font-size": "13px", color: "var(--color-text)" }
}

export default ArtifactGallery
