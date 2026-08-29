import crypto from "node:crypto"
import path from "node:path"
import { Global } from "@/global"
import { JsonStore } from "@/util/jsonstore"
import z from "zod"
import { BioNemoCapabilityID, type BioNemoCapabilityID as ID } from "./schema"

export const BioNemoHostedArtifact = z
  .object({
    path: z.string(),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    mime: z.string(),
  })
  .strict()

export const BioNemoHostedResult = z
  .object({
    capability: BioNemoCapabilityID,
    provider: z.literal("nvidia"),
    endpoint: z.string().url(),
    model_version: z.string(),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    approval_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    payload_bytes: z.number().int().nonnegative(),
    started_at: z.string(),
    completed_at: z.string(),
    root: z.string(),
    artifacts: BioNemoHostedArtifact.array(),
    provider_request_id: z.string().optional(),
  })
  .strict()

export const BioNemoHostedPreview = z
  .object({
    capability: BioNemoCapabilityID,
    provider: z.literal("nvidia"),
    configured: z.boolean(),
    method: z.literal("POST"),
    endpoint: z.string().url(),
    model_version: z.string(),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    approval_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    payload_bytes: z.number().int().nonnegative(),
    payload: z.record(z.string(), z.unknown()),
    terms_url: z.string().url(),
    warning: z.string(),
    dispatched: z.literal(false),
  })
  .strict()

const BioNemoDispatchRecord = z
  .object({
    schema_version: z.literal(1),
    dispatch_id: z.string(),
    session_id: z.string(),
    capability: BioNemoCapabilityID,
    provider: z.literal("nvidia"),
    endpoint: z.string().url(),
    host: z.string(),
    model_version: z.string(),
    request_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    approval_sha256: z.string().regex(/^[a-f0-9]{64}$/),
    payload_bytes: z.number().int().nonnegative(),
    terms_url: z.string().url(),
    attempts: z.number().int().positive(),
    created_at: z.string(),
    updated_at: z.string(),
    status: z.enum(["pending", "unknown", "failed", "succeeded"]),
    http_status: z.number().int().optional(),
    provider_request_id: z.string().optional(),
    error: z.string().optional(),
    result: BioNemoHostedResult.optional(),
  })
  .strict()

export type BioNemoDispatchRecord = z.infer<typeof BioNemoDispatchRecord>
export type BioNemoHostedPreview = z.infer<typeof BioNemoHostedPreview>
export type BioNemoHostedResult = z.infer<typeof BioNemoHostedResult>

const file = () => path.join(Global.Path.data, "scientific-capability-hosted-dispatches.json")
const key = (approval: string) => `nvidia:${approval}`
const requestID = (headers: Headers) =>
  headers.get("nvcf-request-id") ?? headers.get("x-request-id") ?? headers.get("request-id") ?? undefined

function base(input: { preview: BioNemoHostedPreview; sessionID: string; attempts: number }) {
  const host = new URL(input.preview.endpoint).host
  return {
    schema_version: 1 as const,
    dispatch_id: crypto.randomUUID(),
    session_id: input.sessionID,
    capability: input.preview.capability,
    provider: "nvidia" as const,
    endpoint: input.preview.endpoint,
    host,
    model_version: input.preview.model_version,
    request_sha256: input.preview.request_sha256,
    approval_sha256: input.preview.approval_sha256,
    payload_bytes: input.preview.payload_bytes,
    terms_url: input.preview.terms_url,
    attempts: input.attempts,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export namespace BioNemoHostedDispatch {
  export async function get(approvalSha256: string) {
    const data = await JsonStore.read(file())
    const parsed = BioNemoDispatchRecord.safeParse(data[key(approvalSha256)])
    return parsed.success ? parsed.data : undefined
  }

  export async function begin(input: { preview: BioNemoHostedPreview; sessionID: string }) {
    let existing: BioNemoDispatchRecord | undefined
    let created: BioNemoDispatchRecord | undefined
    await JsonStore.update(file(), (data) => {
      const current = BioNemoDispatchRecord.safeParse(data[key(input.preview.approval_sha256)]).data
      if (current?.status === "pending" || current?.status === "unknown" || current?.status === "succeeded") {
        existing = current
        return
      }
      created = BioNemoDispatchRecord.parse({
        ...base({
          preview: input.preview,
          sessionID: input.sessionID,
          attempts: current ? current.attempts + 1 : 1,
        }),
        status: "pending",
      })
      data[key(input.preview.approval_sha256)] = created
    })
    return { existing, created: created! }
  }

  export async function fail(input: {
    preview: BioNemoHostedPreview
    sessionID: string
    status: "failed" | "unknown"
    error: string
    http_status?: number
    provider_request_id?: string
  }) {
    let record: BioNemoDispatchRecord | undefined
    await JsonStore.update(file(), (data) => {
      const current = BioNemoDispatchRecord.safeParse(data[key(input.preview.approval_sha256)]).data
      record = BioNemoDispatchRecord.parse({
        ...(current ??
          base({
            preview: input.preview,
            sessionID: input.sessionID,
            attempts: 1,
          })),
        session_id: input.sessionID,
        updated_at: new Date().toISOString(),
        status: input.status,
        http_status: input.http_status,
        provider_request_id: input.provider_request_id,
        error: input.error,
      })
      data[key(input.preview.approval_sha256)] = record
    })
    return record!
  }

  export async function succeed(input: {
    preview: BioNemoHostedPreview
    sessionID: string
    result: BioNemoHostedResult
    http_status: number
    provider_request_id?: string
  }) {
    let record: BioNemoDispatchRecord | undefined
    await JsonStore.update(file(), (data) => {
      const current = BioNemoDispatchRecord.safeParse(data[key(input.preview.approval_sha256)]).data
      record = BioNemoDispatchRecord.parse({
        ...(current ??
          base({
            preview: input.preview,
            sessionID: input.sessionID,
            attempts: 1,
          })),
        session_id: input.sessionID,
        updated_at: new Date().toISOString(),
        status: "succeeded",
        http_status: input.http_status,
        provider_request_id: input.provider_request_id,
        error: undefined,
        result: input.result,
      })
      data[key(input.preview.approval_sha256)] = record
    })
    return record!
  }

  export function providerRequestID(headers: Headers) {
    return requestID(headers)
  }
}
