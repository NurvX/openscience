import fs from "node:fs/promises"
import path from "node:path"
import { createHash, randomUUID } from "node:crypto"
import { gzipSync } from "node:zlib"
import z from "zod"
import { Global } from "@/global"
import { DataRootBarrier } from "@/global/data-root-barrier"
import { Installation } from "@/installation"
import { OpenScience, API_BASE } from "@/openscience"
import type { MessageV2 } from "@/session/message-v2"
import { Lock } from "@/util/lock"
import { Log } from "@/util/log"

const log = Log.create({ service: "telemetry.outbound" })
const VERSION = 1 as const
export const CONSENT_VERSION = "openscience-analytics-2026-08-20"
const MAX_EVENTS = 256
const MAX_BYTES = 512 * 1024
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
const consentPath = path.join(Global.Path.data, "telemetry-consent-v1.json")
const queuePath = path.join(Global.Path.data, "telemetry-queue-v1.jsonl")

const OptionalCount = z.number().int().nonnegative().nullable().optional()
const Label = z.string().min(1).max(160)
const safeClassPattern = /^[A-Za-z0-9_.:-]+$/
const SafeClass = (max: number) => z.string().min(1).max(max).regex(safeClassPattern)
const ProviderFamily = z.enum([
  "gateway",
  "openai",
  "anthropic",
  "google",
  "amazon",
  "azure",
  "openrouter",
  "xai",
  "mistral",
  "cohere",
  "deepseek",
  "groq",
  "cerebras",
  "perplexity",
  "together",
  "github_copilot",
  "ollama",
  "lmstudio",
  "custom",
])
const ModelFamily = z.enum([
  "gpt",
  "gpt-5",
  "claude",
  "gemini",
  "grok",
  "llama",
  "mistral",
  "deepseek",
  "command",
  "qwen",
  "kimi",
  "glm",
  "phi",
  "nemotron",
  "minimax",
  "sonar",
  "custom",
])

export const Event = z
  .object({
    event_id: SafeClass(160),
    schema_version: z.literal(VERSION),
    event_type: z.enum(["assistant.completed", "tool.completed", "artifact.completed"]),
    occurred_at: z.string().datetime(),
    app_version: Label.optional(),
    platform: SafeClass(40).optional(),
    architecture: SafeClass(40).optional(),
    locale: Label.optional(),
    timezone: Label.optional(),
    installation_id: Label.optional(),
    account_id: Label.optional(),
    session_id: Label.optional(),
    run_id: Label.optional(),
    model_route: SafeClass(80).optional(),
    provider_family: ProviderFamily.optional(),
    model_family: ModelFamily.optional(),
    input_tokens: OptionalCount,
    output_tokens: OptionalCount,
    cached_tokens: OptionalCount,
    reasoning_tokens: OptionalCount,
    tool_name: SafeClass(120).optional(),
    duration_ms: OptionalCount,
    success: z.boolean().optional(),
    cancelled: z.boolean().optional(),
    retry: z.boolean().optional(),
    error_class: SafeClass(120).optional(),
    artifact_type: SafeClass(80).optional(),
    artifact_count: OptionalCount,
    size_bucket: SafeClass(40).optional(),
    search_source: SafeClass(40).optional(),
    search_mode: SafeClass(40).optional(),
    result_count: OptionalCount,
    allowance_state: SafeClass(40).optional(),
    feature: SafeClass(100).optional(),
    funnel_stage: SafeClass(100).optional(),
    plan: SafeClass(60).optional(),
    entitlement_state: SafeClass(60).optional(),
    managed_request_id: Label.optional(),
  })
  .strict()

export type Event = z.infer<typeof Event>

const ConsentEntry = z.object({
  analytics_enabled: z.boolean(),
  research_content_enabled: z.literal(false),
  updated_at: z.string().datetime(),
  pending: z.boolean().optional(),
})

const ConsentFile = z.object({
  schema_version: z.literal(VERSION),
  consent_version: z.string(),
  installation_id: z.string().uuid(),
  active_subject: z.string().optional(),
  subjects: z.record(z.string(), ConsentEntry),
})

type ConsentFile = z.infer<typeof ConsentFile>

const QueueRow = z.object({ subject: z.string(), queued_at: z.number().int(), event: Event })
type QueueRow = z.infer<typeof QueueRow>

export type Status = {
  analyticsEnabled: boolean
  researchContentEnabled: false
  source: "default" | "local" | "account"
  signedIn: boolean
  consentVersion: string
  pending: boolean
  corrupt: boolean
  deletionAvailable: boolean
}

function fresh(): ConsentFile {
  return {
    schema_version: VERSION,
    consent_version: CONSENT_VERSION,
    installation_id: randomUUID(),
    subjects: {},
  }
}

async function atomic(filepath: string, value: string): Promise<void> {
  await using operation = await DataRootBarrier.enter(filepath)
  using _ = await Lock.write(filepath)
  const temporary = `${filepath}.${process.pid}.${randomUUID()}.tmp`
  await fs.mkdir(path.dirname(filepath), { recursive: true })
  try {
    const handle = await fs.open(temporary, "wx", 0o600)
    await handle
      .writeFile(value, "utf8")
      .then(() => handle.sync())
      .finally(() => handle.close())
    await fs.rename(temporary, filepath)
  } catch (error) {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  }
}

async function readConsent(): Promise<{ value: ConsentFile; absent: boolean; corrupt: boolean }> {
  const exists = await Bun.file(consentPath).exists()
  if (!exists) return { value: fresh(), absent: true, corrupt: false }
  try {
    return { value: ConsentFile.parse(await Bun.file(consentPath).json()), absent: false, corrupt: false }
  } catch (error) {
    log.warn("telemetry consent is unreadable; sharing is disabled", {
      error: error instanceof Error ? error.message : String(error),
    })
    return { value: fresh(), absent: false, corrupt: true }
  }
}

async function identity() {
  const session = await OpenScience.getSession().catch(() => null)
  if (!session) return { subject: "installation", signedIn: false, accountID: undefined, token: undefined }
  const account = session.user_id || `key-${createHash("sha256").update(session.api_key).digest("hex").slice(0, 16)}`
  return {
    subject: `account:${account}`,
    signedIn: true,
    accountID: session.user_id || undefined,
    token: session.api_key,
  }
}

async function rows(): Promise<QueueRow[]> {
  const text = await fs.readFile(queuePath, "utf8").catch(() => "")
  const cutoff = Date.now() - MAX_AGE_MS
  return text
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = QueueRow.parse(JSON.parse(line))
        return parsed.queued_at >= cutoff ? [parsed] : []
      } catch {
        return []
      }
    })
}

async function writeRows(input: QueueRow[]) {
  const bounded = input.slice(-MAX_EVENTS)
  const selected = (() => {
    const kept: QueueRow[] = []
    for (const row of bounded.toReversed()) {
      const next = [row, ...kept]
      const size = Buffer.byteLength(next.map((item) => JSON.stringify(item)).join("\n") + "\n")
      if (size > MAX_BYTES) break
      kept.unshift(row)
    }
    return kept
  })()
  if (!selected.length) {
    await fs.rm(queuePath, { force: true }).catch(() => undefined)
    return
  }
  await atomic(queuePath, selected.map((item) => JSON.stringify(item)).join("\n") + "\n")
}

async function activate(state: ConsentFile, subject: string) {
  if (!state.active_subject) {
    state.active_subject = subject
    await atomic(consentPath, JSON.stringify(state, null, 2))
    return
  }
  if (state.active_subject === subject) return
  // Signing in links only future events. Account switching drops unsent rows
  // instead of ever flushing one identity's activity under another identity.
  await writeRows([])
  state.active_subject = subject
  await atomic(consentPath, JSON.stringify(state, null, 2))
}

function failClosed(state: ConsentFile, subject: string, corrupt: boolean) {
  if (!corrupt) return
  state.subjects[subject] = {
    analytics_enabled: false,
    research_content_enabled: false,
    updated_at: new Date().toISOString(),
  }
}

function localStatus(
  state: ConsentFile,
  subject: string,
  signedIn: boolean,
  absent: boolean,
  corrupt: boolean,
): Status {
  const entry = state.subjects[subject]
  return {
    analyticsEnabled: corrupt ? false : (entry?.analytics_enabled ?? true),
    researchContentEnabled: false,
    source: entry ? (signedIn ? "account" : "local") : "default",
    signedIn,
    consentVersion: state.consent_version,
    pending: entry?.pending === true,
    corrupt,
    deletionAvailable: signedIn,
  }
}

async function remoteConsent(state: ConsentFile, who: Awaited<ReturnType<typeof identity>>) {
  if (!who.token) return
  const entry = state.subjects[who.subject]
  const request = entry?.pending
    ? fetch(`${API_BASE}/api/v1/telemetry/consent`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          consent_version: state.consent_version,
          analytics_enabled: entry.analytics_enabled,
          research_content_enabled: false,
          installation_id: state.installation_id,
        }),
        signal: AbortSignal.timeout(10_000),
      })
    : fetch(`${API_BASE}/api/v1/telemetry/consent`, {
        headers: { Authorization: `Bearer ${who.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      })
  const response = await request.catch(() => undefined)
  if (!response?.ok) return
  const body = (await response.json().catch(() => undefined)) as
    | {
        analytics_enabled?: boolean
        research_content_enabled?: boolean
        effective?: { analytics_enabled?: boolean; research_content_enabled?: boolean }
        consent_version?: string
      }
    | undefined
  const enabled = entry?.pending
    ? entry.analytics_enabled
    : (body?.analytics_enabled ?? body?.effective?.analytics_enabled)
  if (typeof enabled !== "boolean") return
  state.subjects[who.subject] = {
    analytics_enabled: enabled,
    research_content_enabled: false,
    updated_at: new Date().toISOString(),
    pending: false,
  }
  if (body?.consent_version) state.consent_version = body.consent_version
  await atomic(consentPath, JSON.stringify(state, null, 2))
}

function pseudonym(installationID: string, value: string) {
  return createHash("sha256").update(`${installationID}:${value}`).digest("hex").slice(0, 24)
}

function common(state: ConsentFile, who: Awaited<ReturnType<typeof identity>>, sessionID?: string) {
  const intl = Intl.DateTimeFormat().resolvedOptions()
  return {
    event_id: randomUUID(),
    schema_version: VERSION,
    occurred_at: new Date().toISOString(),
    app_version: Installation.VERSION,
    platform: process.platform,
    architecture: process.arch,
    ...(intl.locale ? { locale: intl.locale } : {}),
    ...(intl.timeZone ? { timezone: intl.timeZone } : {}),
    installation_id: state.installation_id,
    ...(who.accountID ? { account_id: who.accountID } : {}),
    ...(sessionID ? { session_id: pseudonym(state.installation_id, sessionID) } : {}),
  }
}

async function append(sessionID: string | undefined, fields: Record<string, unknown>) {
  const who = await identity()
  const consent = await readConsent()
  failClosed(consent.value, who.subject, consent.corrupt)
  await activate(consent.value, who.subject)
  const status = localStatus(consent.value, who.subject, who.signedIn, consent.absent, consent.corrupt)
  if (!status.analyticsEnabled) return false
  const event = Event.parse({ ...common(consent.value, who, sessionID), ...fields })
  const queued = await rows()
  queued.push({ subject: who.subject, queued_at: Date.now(), event })
  await writeRows(queued)
  void OutboundTelemetry.flush().catch(() => undefined)
  return true
}

function classification(value: string | undefined, max: number) {
  if (!value) return
  const normalized = value.trim()
  return normalized.length <= max && safeClassPattern.test(normalized) ? normalized : "custom"
}

function sizeBucket(size: number) {
  if (size < 1024) return "lt_1kb"
  if (size < 1024 * 1024) return "1kb_1mb"
  if (size < 100 * 1024 * 1024) return "1mb_100mb"
  return "gte_100mb"
}

const providerFamilies: Record<string, z.infer<typeof ProviderFamily>> = {
  synsci: "gateway",
  openai: "openai",
  "openai-codex": "openai",
  anthropic: "anthropic",
  google: "google",
  "google-vertex": "google",
  "amazon-bedrock": "amazon",
  azure: "azure",
  openrouter: "openrouter",
  xai: "xai",
  mistral: "mistral",
  cohere: "cohere",
  deepseek: "deepseek",
  groq: "groq",
  cerebras: "cerebras",
  perplexity: "perplexity",
  togetherai: "together",
  "github-copilot": "github_copilot",
  "github-copilot-enterprise": "github_copilot",
  ollama: "ollama",
  lmstudio: "lmstudio",
}

const modelFamilies: Array<[z.infer<typeof ModelFamily>, RegExp]> = [
  ["gpt", /(?:^|[^a-z0-9])(?:gpt|o[134]|codex)(?:[^a-z0-9]|$)/],
  ["claude", /claude/],
  ["gemini", /gemini/],
  ["grok", /grok/],
  ["llama", /llama/],
  ["mistral", /mistral|mixtral|codestral/],
  ["deepseek", /deepseek/],
  ["command", /(?:^|[^a-z])command(?:[^a-z]|$)/],
  ["qwen", /qwen/],
  ["kimi", /kimi|moonshot/],
  ["glm", /(?:^|[^a-z])glm(?:[^a-z]|$)/],
  ["phi", /(?:^|[^a-z])phi(?:[^a-z]|$)/],
  ["nemotron", /nemotron/],
  ["minimax", /minimax/],
  ["sonar", /sonar/],
]

export function coarseProviderFamily(value: string): z.infer<typeof ProviderFamily> {
  return providerFamilies[value.trim().toLowerCase()] ?? "custom"
}

export function coarseModelFamily(value: string): z.infer<typeof ModelFamily> {
  const normalized = value.trim().toLowerCase()
  return modelFamilies.find(([, pattern]) => pattern.test(normalized))?.[0] ?? "custom"
}

export namespace OutboundTelemetry {
  export async function status(refresh = false): Promise<Status> {
    const who = await identity()
    const consent = await readConsent()
    failClosed(consent.value, who.subject, consent.corrupt)
    await activate(consent.value, who.subject)
    if (refresh && !consent.corrupt) await remoteConsent(consent.value, who)
    const latest = refresh && !consent.corrupt ? await readConsent() : consent
    return localStatus(latest.value, who.subject, who.signedIn, latest.absent, latest.corrupt)
  }

  export async function enabled(): Promise<boolean> {
    return status(false).then((value) => value.analyticsEnabled)
  }

  export async function setAnalytics(enabled: boolean): Promise<Status> {
    const who = await identity()
    const consent = await readConsent()
    if (consent.corrupt) {
      consent.value = fresh()
      consent.corrupt = false
    }
    await activate(consent.value, who.subject)
    consent.value.subjects[who.subject] = {
      analytics_enabled: enabled,
      research_content_enabled: false,
      updated_at: new Date().toISOString(),
      pending: who.signedIn,
    }
    if (!enabled) {
      consent.value.installation_id = randomUUID()
      await writeRows([])
    }
    await atomic(consentPath, JSON.stringify(consent.value, null, 2))
    await remoteConsent(consent.value, who)
    return status(false)
  }

  export async function requestDeletion(): Promise<{ ok: boolean; message?: string }> {
    const who = await identity()
    if (!who.token) return { ok: false, message: "Sign in to request deletion of account-linked analytics." }
    const response = await fetch(`${API_BASE}/api/v1/telemetry/account-data`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${who.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "analytics" }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined)
    if (!response?.ok) return { ok: false, message: "Account-linked analytics could not be deleted." }

    const consent = await readConsent()
    if (consent.corrupt) consent.value = fresh()
    consent.value.active_subject = who.subject
    consent.value.installation_id = randomUUID()
    consent.value.subjects[who.subject] = {
      analytics_enabled: false,
      research_content_enabled: false,
      updated_at: new Date().toISOString(),
      pending: false,
    }
    await writeRows([])
    await atomic(consentPath, JSON.stringify(consent.value, null, 2))
    return { ok: true }
  }

  export async function flush(): Promise<void> {
    const who = await identity()
    const consent = await readConsent()
    failClosed(consent.value, who.subject, consent.corrupt)
    await activate(consent.value, who.subject)
    const status = localStatus(consent.value, who.subject, who.signedIn, consent.absent, consent.corrupt)
    if (!status.analyticsEnabled) {
      await writeRows([])
      return
    }
    const queued = await rows()
    const sending = queued.filter((row) => row.subject === who.subject).slice(0, 64)
    if (!sending.length) return
    const payload = JSON.stringify({
      schema_version: VERSION,
      consent_version: consent.value.consent_version,
      installation_id: consent.value.installation_id,
      events: sending.map((row) => row.event),
    })
    const response = await fetch(`${API_BASE}/api/v1/telemetry/batch`, {
      method: "POST",
      headers: {
        ...(who.token ? { Authorization: `Bearer ${who.token}` } : {}),
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
      body: new Uint8Array(gzipSync(payload)),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => undefined)
    if (!response?.ok) return
    const accepted = new Set(sending.map((row) => row.event.event_id))
    await writeRows(queued.filter((row) => !accepted.has(row.event.event_id)))
  }

  export async function assistant(input: {
    sessionID: string
    route: string
    provider: string
    model: string
    tokens: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  }) {
    return append(input.sessionID, {
      event_type: "assistant.completed",
      model_route: classification(input.route, 80),
      provider_family: coarseProviderFamily(input.provider),
      model_family: coarseModelFamily(input.model),
      input_tokens: input.tokens.input,
      output_tokens: input.tokens.output,
      cached_tokens: input.tokens.cache.read + input.tokens.cache.write,
      reasoning_tokens: input.tokens.reasoning,
      success: true,
    })
  }

  export async function tool(part: MessageV2.ToolPart) {
    if (part.state.status !== "completed" && part.state.status !== "error") return false
    const end = part.state.time.end ?? Date.now()
    const meta = part.state.status === "completed" ? part.state.metadata : undefined
    const search = part.tool === "research_search" || part.tool === "websearch"
    return append(part.sessionID, {
      event_type: "tool.completed",
      tool_name: classification(part.tool, 120),
      duration_ms: Math.max(0, end - part.state.time.start),
      success: part.state.status === "completed",
      cancelled: part.state.status === "error" && part.state.error.toLowerCase().includes("abort"),
      ...(part.state.status === "error" ? { error_class: classification(part.state.error.split(":", 1)[0], 120) } : {}),
      ...(search && typeof meta?.searchSource === "string"
        ? { search_source: classification(meta.searchSource, 40) }
        : {}),
      ...(search && typeof meta?.searchMode === "string" ? { search_mode: classification(meta.searchMode, 40) } : {}),
      ...(search && typeof meta?.resultCount === "number" ? { result_count: meta.resultCount } : {}),
      ...(search && typeof meta?.allowanceState === "string"
        ? { allowance_state: classification(meta.allowanceState, 40) }
        : {}),
    })
  }

  export async function artifact(input: { sessionID: string; type: string; size: number }) {
    return append(input.sessionID, {
      event_type: "artifact.completed",
      artifact_type: classification(input.type, 80),
      artifact_count: 1,
      size_bucket: sizeBucket(input.size),
      success: true,
    })
  }
}
