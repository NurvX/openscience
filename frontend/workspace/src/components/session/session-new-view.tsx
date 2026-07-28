import { For, Show, createMemo, createResource, createSignal, type JSX } from "solid-js"
import { DateTime } from "luxon"
import { useSync } from "@/context/sync"
import { useModels } from "@/context/models"
import { useSDK } from "@/context/sdk"
import { usePlatform } from "@/context/platform"
import { useDialog } from "@synsci/ui/context/dialog"
import { getDirectory, getFilename } from "@synsci/util/path"
import { DialogSettings } from "@/components/dialog-settings"
import { centerTabs } from "@/atlas/store/centerTabs"
import { uiStore } from "@/atlas/store/ui"
import { toast } from "@/atlas/Toast"
import {
  IconActivity,
  IconArrowRight,
  IconAtom,
  IconBraces,
  IconCheckCircle,
  IconFile,
  IconFolder,
  IconLayoutGrid,
  IconNetwork,
  IconRefresh,
  IconSearch,
} from "@/atlas/shared/Icon"
import {
  researchStarters,
  researchWorkflows,
  workflowPrompt,
  type ResearchStarter,
  type ResearchWorkflow,
} from "@/components/session/research-launchpad"

const MAIN_WORKTREE = "main"
const CREATE_WORKTREE = "create"

interface NewSessionViewProps {
  worktree: string
  onWorktreeChange: (value: string) => void
}

const icons: Record<ResearchWorkflow["icon"], (props: { size?: number; strokeWidth?: number }) => JSX.Element> = {
  table: IconLayoutGrid,
  notebook: IconBraces,
  atom: IconAtom,
  sequence: IconActivity,
  search: IconSearch,
  reproduce: IconRefresh,
  compare: IconNetwork,
  report: IconFile,
  activity: IconActivity,
  network: IconNetwork,
}

export function NewSessionView(props: NewSessionViewProps) {
  const sync = useSync()
  const models = useModels()
  const sdk = useSDK()
  const platform = usePlatform()
  const dialog = useDialog()
  const noModel = createMemo(() => models.list().length === 0)
  const sandboxes = createMemo(() => sync.project?.sandboxes ?? [])
  const options = createMemo(() => [MAIN_WORKTREE, ...sandboxes(), CREATE_WORKTREE])
  const current = createMemo(() => (options().includes(props.worktree) ? props.worktree : MAIN_WORKTREE))
  const projectRoot = createMemo(() => sync.project?.worktree ?? sync.data.path.directory)
  const projectName = createMemo(() => getFilename(projectRoot()) || "research project")
  const branch = createMemo(() => sync.data.vcs?.branch || "working tree")
  const [artifacts] = createResource(
    () => sdk.directory,
    () =>
      sdk.client.file
        .artifacts()
        .then((response) => response.data ?? [])
        .catch(() => []),
  )
  const [workflowGroup, setWorkflowGroup] = createSignal<ResearchWorkflow["group"] | "all">("all")
  const [creating, setCreating] = createSignal<ResearchStarter["id"]>()
  const visibleWorkflows = createMemo(() =>
    workflowGroup() === "all"
      ? researchWorkflows
      : researchWorkflows.filter((workflow) => workflow.group === workflowGroup()),
  )
  const local = createMemo(() => {
    try {
      const host = new URL(sdk.url).hostname
      return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]"
    } catch {
      return false
    }
  })

  const worktreeLabel = (value: string) => {
    if (value === MAIN_WORKTREE) return branch()
    if (value === CREATE_WORKTREE) return "new isolated worktree"
    return getFilename(value)
  }

  const start = (workflow: ResearchWorkflow) => {
    uiStore.setPrefill(workflowPrompt(workflow, artifacts.latest?.length ?? 0))
    centerTabs.showChat()
  }

  const createStarter = async (starter: ResearchStarter) => {
    setCreating(starter.id)
    const request = platform.fetch ?? fetch
    const endpoint = new URL(`${sdk.url.replace(/\/+$/, "")}/file/starters`)
    endpoint.searchParams.set("directory", sdk.directory)
    const response = await request(endpoint.toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ template: starter.id }),
    }).catch((error) => {
      toast.error("starter could not be created", error instanceof Error ? error.message : String(error))
      return undefined
    })
    setCreating(undefined)
    if (!response) return
    if (!response.ok) {
      const detail = await response.text().catch(() => "")
      toast.error("starter could not be created", detail || `${response.status}`)
      return
    }
    const result = (await response.json()) as { notebook: string; files: string[] }
    toast.success("starter project ready", `${result.files.length} local files created`)
    centerTabs.openFile(sdk.directory, result.notebook)
  }

  return (
    <main class="atlas-scroll research-launchpad" data-component="research-launchpad">
      <div class="research-launchpad__inner">
        <section class="research-launchpad__intro" aria-labelledby="research-launchpad-title">
          <div>
            <div class="research-launchpad__eyebrow">Research workspace</div>
            <h1 id="research-launchpad-title">What are we trying to find out?</h1>
            <p>
              Start with a concrete workflow or describe the result you need. OpenScience can inspect project files, run
              code, edit notebooks, and keep the evidence next to the work.
            </p>
          </div>
          <div class="research-launchpad__project" title={projectRoot()}>
            <IconFolder size={15} strokeWidth={1.45} />
            <div>
              <strong>{projectName()}</strong>
              <span>
                {getDirectory(projectRoot())}
                {projectName()}
              </span>
            </div>
          </div>
        </section>

        <section class="research-launchpad__status" aria-label="Workspace readiness">
          <button
            type="button"
            class="research-launchpad__status-item"
            data-state={noModel() ? "attention" : "ready"}
            onClick={() => {
              if (noModel()) dialog.show(() => <DialogSettings />)
            }}
          >
            <span class="research-launchpad__status-dot" />
            <span>
              <strong>{noModel() ? "Connect a model" : `${models.list().length} models ready`}</strong>
              <small>{noModel() ? "required before the first run" : "choose one in the composer"}</small>
            </span>
          </button>
          <div class="research-launchpad__status-item" data-state="ready">
            <span class="research-launchpad__status-dot" />
            <span>
              <strong>{local() ? "Local compute ready" : "Remote compute connected"}</strong>
              <small>{local() ? "terminal and notebook kernels available" : sdk.url}</small>
            </span>
          </div>
          <button type="button" class="research-launchpad__status-item" onClick={() => centerTabs.setActive("files")}>
            <span class="research-launchpad__status-count">
              <Show when={!artifacts.loading} fallback="··">
                {(artifacts.latest?.length ?? 0).toLocaleString()}
              </Show>
            </span>
            <span>
              <strong>Research artifacts</strong>
              <small>
                {artifacts.error ? "scan unavailable · open Files" : "notebooks, data, figures, and models"}
              </small>
            </span>
          </button>
        </section>

        <Show when={noModel()}>
          <section class="research-launchpad__notice" role="status">
            <div>
              <strong>No model is connected yet</strong>
              <span>
                Add OpenAI, Anthropic, Gemini, OpenRouter, or a local model. Your project files stay on the selected
                compute host.
              </span>
            </div>
            <button type="button" onClick={() => dialog.show(() => <DialogSettings />)}>
              open model settings
              <IconArrowRight size={12} strokeWidth={1.7} />
            </button>
          </section>
        </Show>

        <section class="research-launchpad__starters" aria-labelledby="research-starters-title">
          <div class="research-launchpad__section-heading">
            <div>
              <h2 id="research-starters-title">Start with working science</h2>
              <p>
                Create a valid notebook, sample data, and a short local README in one click. No download or gateway.
              </p>
            </div>
            <span class="research-launchpad__local-badge">local · reproducible</span>
          </div>
          <div class="research-launchpad__starter-grid">
            <For each={researchStarters}>
              {(starter) => (
                <button
                  type="button"
                  class="research-launchpad__starter"
                  data-starter={starter.id}
                  disabled={Boolean(creating())}
                  onClick={() => void createStarter(starter)}
                  style={{ "--starter-accent": starter.accent }}
                >
                  <span class="research-launchpad__starter-visual">
                    <For each={Array.from({ length: 9 })}>
                      {(_, index) => <i style={{ height: `${22 + ((index() * 31 + starter.title.length) % 65)}%` }} />}
                    </For>
                  </span>
                  <span class="research-launchpad__starter-copy">
                    <strong>{starter.title}</strong>
                    <span>{starter.description}</span>
                    <small>{starter.files.join(" · ")}</small>
                  </span>
                  <span class="research-launchpad__starter-action">
                    {creating() === starter.id ? "creating…" : "create starter"}
                    <IconArrowRight size={12} strokeWidth={1.7} />
                  </span>
                </button>
              )}
            </For>
          </div>
        </section>

        <section class="research-launchpad__workflows" aria-labelledby="research-workflows-title">
          <div class="research-launchpad__section-heading">
            <div>
              <h2 id="research-workflows-title">Start from a workflow</h2>
              <p>Each one writes a detailed, editable brief into the composer.</p>
            </div>
            <label class="research-launchpad__worktree">
              <span>Run on</span>
              <select value={current()} onChange={(event) => props.onWorktreeChange(event.currentTarget.value)}>
                <For each={options()}>{(option) => <option value={option}>{worktreeLabel(option)}</option>}</For>
              </select>
            </label>
          </div>

          <nav class="research-launchpad__workflow-filters" aria-label="Workflow categories">
            <For
              each={
                [
                  ["all", "All workflows"],
                  ["analyze", "Analyze"],
                  ["compute", "Compute"],
                  ["discover", "Discover"],
                  ["communicate", "Communicate"],
                ] as const
              }
            >
              {(item) => (
                <button
                  type="button"
                  data-active={workflowGroup() === item[0] ? "true" : "false"}
                  onClick={() => setWorkflowGroup(item[0])}
                >
                  {item[1]}
                  <span>
                    {item[0] === "all"
                      ? researchWorkflows.length
                      : researchWorkflows.filter((workflow) => workflow.group === item[0]).length}
                  </span>
                </button>
              )}
            </For>
          </nav>

          <div class="research-launchpad__grid">
            <For each={visibleWorkflows()}>
              {(workflow, index) => {
                const Icon = icons[workflow.icon]
                return (
                  <button
                    type="button"
                    class="research-launchpad__workflow"
                    data-workflow={workflow.id}
                    data-featured={index() === 0 ? "true" : "false"}
                    onClick={() => start(workflow)}
                  >
                    <span class="research-launchpad__workflow-icon">
                      <Icon size={16} strokeWidth={1.45} />
                    </span>
                    <span class="research-launchpad__workflow-copy">
                      <strong>{workflow.title}</strong>
                      <span>{workflow.description}</span>
                      <small>{workflow.shortcut}</small>
                    </span>
                    <IconArrowRight class="research-launchpad__workflow-arrow" size={13} strokeWidth={1.7} />
                  </button>
                )
              }}
            </For>
          </div>
        </section>

        <footer class="research-launchpad__footer">
          <span>
            <IconCheckCircle size={13} strokeWidth={1.5} />
            {branch()}
          </span>
          <Show when={sync.project}>
            {(project) => (
              <span>
                updated{" "}
                {DateTime.fromMillis(project().time.updated ?? project().time.created)
                  .setLocale("en")
                  .toRelative()}
              </span>
            )}
          </Show>
          <span>or describe your goal below</span>
        </footer>
      </div>
    </main>
  )
}
