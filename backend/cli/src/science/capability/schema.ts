import z from "zod"
import { JobBroker } from "@/compute/job-broker"

export const CapabilityMaturity = z.enum(["verified", "experimental", "blocked"])
export type CapabilityMaturity = z.infer<typeof CapabilityMaturity>
export const CapabilityStatus = CapabilityMaturity
export type CapabilityStatus = CapabilityMaturity
export const CapabilityAvailabilityState = z.enum(["ready", "setup_needed", "degraded", "unavailable", "not_applicable"])
export type CapabilityAvailabilityState = z.infer<typeof CapabilityAvailabilityState>
export const CapabilityAvailability = z.object({ local: CapabilityAvailabilityState, hosted: CapabilityAvailabilityState }).strict()
export type CapabilityAvailability = z.infer<typeof CapabilityAvailability>
export const CapabilityCategory = z.enum([
  "analysis", "visualization", "bioinformatics", "cheminformatics", "structure", "docking", "protein_design",
  "genomics", "molecular_modeling", "quantum", "mass_spectrometry", "chromatography", "synthesis", "document",
])
export type CapabilityCategory = z.infer<typeof CapabilityCategory>
export const CapabilityPackagePin = z.string().trim().regex(/^[A-Za-z0-9_.-]+==[^=<>!~\s]+$/, "Capability packages must use an exact version pin")
export type CapabilityPackagePin = z.infer<typeof CapabilityPackagePin>
export const CapabilitySource = z.object({
  kind: z.enum(["pypi", "conda", "github", "system", "nvidia_nim"]), name: z.string().trim().min(1).max(160),
  version: z.string().trim().min(1).max(160), reference: z.string().trim().url(), license: z.string().trim().min(1).max(160).optional(),
}).strict()
export type CapabilitySource = z.infer<typeof CapabilitySource>
export const CapabilitySmoke = z.object({
  id: z.string().trim().min(1).max(120), script_digest: z.string().regex(/^[a-f0-9]{64}$/), language: z.literal("python"),
  result_path: z.string().trim().min(1).max(240), artifacts: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  max_artifact_bytes: z.number().int().positive().max(1024 * 1024), timeout_seconds: z.number().int().min(5).max(600),
  summary: z.string().trim().min(1).max(240), invariants: z.array(z.string().trim().min(1).max(240)).min(1).max(12),
}).strict()
export type CapabilitySmoke = z.infer<typeof CapabilitySmoke>
export const CapabilityRuntime = z.object({
  kind: z.literal("python_pack"), pack_id: z.string().trim().min(1).max(120), python: z.string().regex(/^\d+\.\d+\.\d+$/),
  targets: z.array(z.enum(["local", "modal"])).min(1).max(2), image: z.string().regex(/^[^\s@]+@sha256:[a-f0-9]{64}$/, "Capability images must use an immutable sha256 digest"),
  lock_digest: z.string().regex(/^[a-f0-9]{64}$/), packages: CapabilityPackagePin.array().min(1).max(100),
  resources: z.object({ cpus: z.number().int().min(1).max(16), memory_gb: z.number().min(0.5).max(64), time_minutes: z.number().int().min(1).max(120), gpu: z.literal("none") }).strict(),
  network: z.enum(["package_index_build_only", "none"]),
}).strict()
export type CapabilityRuntime = z.infer<typeof CapabilityRuntime>
export const CapabilityHosted = z.object({
  kind: z.literal("nvidia_nim"), adapter_id: z.enum(["boltz2", "diffdock", "proteinmpnn", "rfdiffusion"]),
  credential: z.literal("nvidia_nim"), docs_url: z.string().url(), terms_url: z.string().url(),
}).strict()
export type CapabilityHosted = z.infer<typeof CapabilityHosted>
export const CapabilitySetup = z.object({ instructions: z.string().trim().min(1).max(1_000), requirements: z.array(z.string().trim().min(1).max(300)).max(20).default([]) }).strict()
export type CapabilitySetup = z.infer<typeof CapabilitySetup>
export const CapabilityManifest = z.object({
  schema_version: z.literal(2), id: z.string().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/), version: z.string().regex(/^\d+\.\d+\.\d+$/),
  name: z.string().trim().min(1).max(120), category: CapabilityCategory, summary: z.string().trim().min(1).max(600),
  maturity: CapabilityMaturity, availability: CapabilityAvailability, basis: z.string().trim().min(1).max(1_500), source: CapabilitySource,
  runtime: CapabilityRuntime.optional(), smoke: CapabilitySmoke.optional(), hosted: CapabilityHosted.optional(), setup: CapabilitySetup.optional(),
  blocker: z.string().trim().min(1).max(1_500).optional(),
}).strict().superRefine((value, ctx) => {
  if ((value.runtime && !value.smoke) || (!value.runtime && value.smoke)) ctx.addIssue({ code: "custom", path: ["smoke"], message: "Packaged runtimes and smoke contracts must be declared together" })
  if (value.maturity === "blocked" && !value.blocker) ctx.addIssue({ code: "custom", path: ["blocker"], message: "Blocked capabilities require a blocker" })
  if (!value.runtime && !value.hosted && !value.setup && value.maturity !== "blocked") ctx.addIssue({ code: "custom", path: ["setup"], message: "Catalog-only capabilities require truthful setup guidance" })
  if (value.availability.local === "ready" && !value.runtime) ctx.addIssue({ code: "custom", path: ["availability", "local"], message: "Local readiness requires a packaged runtime" })
  if (value.availability.hosted === "ready" && !value.runtime?.targets.includes("modal") && !value.hosted) ctx.addIssue({ code: "custom", path: ["availability", "hosted"], message: "Hosted readiness requires a Modal runtime or hosted adapter" })
})
export type CapabilityManifest = z.infer<typeof CapabilityManifest>
/** Callers describe work but cannot replace the pinned environment, GPU, or secrets. */
export const CapabilityWorkload = z.object({
  name: z.string().trim().min(1).max(120), purpose: z.string().trim().min(1).max(500), command: z.string().trim().min(1).max(100_000),
  target: z.enum(["local", "modal"]), cwd: z.string().trim().min(1).max(2_000).optional(),
  resources: z.object({ cpus: z.number().int().min(1).max(16).optional(), memory_gb: z.number().min(0.5).max(64).optional(), time_minutes: z.number().int().min(1).max(120).optional() }).strict().optional(),
  artifacts: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(), uploads: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
}).strict()
export type CapabilityWorkload = z.infer<typeof CapabilityWorkload>
export const CapabilityCompiledJob = JobBroker.Input.extend({ capability: JobBroker.CapabilityBinding })
export type CapabilityCompiledJob = z.infer<typeof CapabilityCompiledJob>
