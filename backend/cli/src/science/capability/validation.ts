import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { JobBroker } from "@/compute/job-broker"
import { SessionFilesystem } from "@/session/filesystem"
import { Filesystem } from "@/util/filesystem"
import type { CapabilityManifest } from "./schema"

const Result = z.object({ schema_version: z.literal(1), capability_id: z.string(), ok: z.literal(true), metrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])) }).strict()
const bound = (left: JobBroker.CapabilityBinding | undefined, right: JobBroker.CapabilityBinding) => Boolean(left && left.id === right.id && left.version === right.version && left.manifest_sha256 === right.manifest_sha256 && left.profile === right.profile && left.runtime_digest === right.runtime_digest)
async function checked(workspace: string, root: string, relative: string, max: number) {
  const canonical = await Filesystem.canonical(path.resolve(root, relative))
  if (!canonical || !Filesystem.contains(workspace, canonical) || !Filesystem.contains(root, canonical)) throw new Error(`Capability artifact escaped its governed Session scratch directory: ${relative}`)
  const stat = await fs.stat(canonical).catch(() => undefined); if (!stat?.isFile()) throw new Error(`Capability artifact is missing: ${relative}`); if (stat.size > max) throw new Error(`Capability artifact exceeds its ${max}-byte contract: ${relative}`)
  const bytes = await Bun.file(canonical).arrayBuffer(); return { stat, bytes, sha256: new Bun.CryptoHasher("sha256").update(bytes).digest("hex") }
}
const close = (actual: unknown, expected: number, tolerance: number) => typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance
function verifyMetrics(id: string, value: Record<string, string | number | boolean>) {
  if (id === "scipy" && (!close(value.x, 3, 1e-5) || !close(value.objective, 2, 1e-7))) throw new Error("SciPy smoke did not converge to its optimizer invariant")
  if (id === "matplotlib" && (value.width !== 300 || value.height !== 200 || typeof value.variance !== "number" || value.variance <= 1)) throw new Error("Matplotlib smoke did not satisfy its image invariant")
  if (id === "scikit-learn" && (value.predictions !== 38 || value.classes !== 3 || typeof value.accuracy !== "number" || value.accuracy < 0.89)) throw new Error("scikit-learn smoke did not satisfy its fixed-split invariant")
  if (id === "biopython" && (value.records !== 1 || value.reverse_complement !== "CTATCGGGCACCCTTTCAGCGGCCCATTACAATGGCCAT" || value.translation !== "MAIVMGR")) throw new Error("Biopython smoke did not satisfy its exact sequence invariant")
  if (id === "rdkit" && (value.formula !== "C8H10N4O2" || typeof value.molecular_weight !== "number" || value.molecular_weight <= 194 || value.molecular_weight >= 195 || value.sdf_roundtrip !== true)) throw new Error("RDKit smoke did not satisfy its molecule invariant")
}
const u32 = (bytes: Uint8Array, offset: number) => ((bytes[offset]! << 24) | (bytes[offset + 1]! << 16) | (bytes[offset + 2]! << 8) | bytes[offset + 3]!) >>> 0
export async function validateCapabilitySmoke(input: { manifest: CapabilityManifest; job: JobBroker.Job; sessionID: string; expectedBinding: JobBroker.CapabilityBinding }) {
  const smoke = input.manifest.smoke; if (!smoke) throw new Error(`${input.manifest.name} has no packaged smoke contract`)
  if (input.job.status !== "succeeded") throw new Error(`Capability job ${input.job.id} has not succeeded`)
  if (input.expectedBinding.profile !== "smoke" || !bound(input.job.capability, input.expectedBinding)) throw new Error(`Capability job ${input.job.id} is not bound to the current ${input.manifest.name} smoke manifest`)
  if (!input.job.cwd) throw new Error(`Capability job ${input.job.id} has no governed working directory`)
  const workspace = await SessionFilesystem.workspace(input.sessionID), root = path.resolve(input.job.cwd); if (!Filesystem.contains(workspace, root)) throw new Error("Capability smoke root escaped Session scratch")
  const delivered = new Map((input.job.artifacts ?? []).map((item) => [item.path.split(path.sep).join("/"), item])), artifacts = []
  for (const relative of smoke.artifacts) { const captured = delivered.get(relative); if (!captured) throw new Error(`Capability job did not deliver declared artifact: ${relative}`); const current = await checked(workspace, root, relative, smoke.max_artifact_bytes); if (current.stat.size !== captured.size || current.sha256 !== captured.sha256) throw new Error(`Capability artifact changed after immutable capture: ${relative}`); artifacts.push({ path: relative, size: current.stat.size, sha256: current.sha256 }) }
  const resultFile = await checked(workspace, root, smoke.result_path, smoke.max_artifact_bytes), result = Result.parse(JSON.parse(Buffer.from(resultFile.bytes).toString("utf8")))
  if (result.capability_id !== input.manifest.id) throw new Error(`Capability result belongs to ${result.capability_id}, expected ${input.manifest.id}`); verifyMetrics(input.manifest.id, result.metrics)
  if (input.manifest.id === "matplotlib") { const image = new Uint8Array((await checked(workspace, root, "capability-figure.png", smoke.max_artifact_bytes)).bytes), signature = [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]; if (!signature.every((entry, index) => image[index] === entry) || u32(image, 16) !== 300 || u32(image, 20) !== 200) throw new Error("Matplotlib smoke did not produce the declared PNG") }
  if (input.manifest.id === "rdkit") { const sdf = await checked(workspace, root, "capability-molecule.sdf", smoke.max_artifact_bytes); if (!Buffer.from(sdf.bytes).toString("utf8").includes("$$$$")) throw new Error("RDKit smoke SDF is incomplete") }
  return { ok: true as const, capability_id: input.manifest.id, target: input.job.target.kind === "modal" ? ("modal" as const) : ("local" as const), metrics: result.metrics, artifacts }
}
