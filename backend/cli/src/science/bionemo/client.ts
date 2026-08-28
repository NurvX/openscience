import crypto from "node:crypto"
import fs from "node:fs/promises"
import path from "node:path"
import { OpenScience } from "@/openscience"
import { resolveCredentialFields } from "@/server/routes/settings/credentials"
import { SessionFilesystem } from "@/session/filesystem"
import { BioNemoCapabilityID, parseBioNemoInput, type BioNemoCapabilityID as ID } from "./schema"

const TERMS = "https://assets.ngc.nvidia.com/products/api-catalog/legal/NVIDIA_API_Trial_Service_Terms.pdf"
const specs = {
  boltz2: {
    endpoint: "https://health.api.nvidia.com/v1/biology/mit/boltz2/predict",
    version: "2.2.1",
    docs: "https://docs.api.nvidia.com/nim/reference/mit-boltz2-infer",
  },
  diffdock: {
    endpoint: "https://health.api.nvidia.com/v1/molecular-docking/diffdock/generate",
    version: "2.2",
    docs: "https://docs.api.nvidia.com/nim/reference/mit-diffdock-infer",
  },
  proteinmpnn: {
    endpoint: "https://health.api.nvidia.com/v1/biology/ipd/proteinmpnn/predict",
    version: "1.1.0",
    docs: "https://docs.api.nvidia.com/nim/reference/ipd-proteinmpnn-infer",
  },
  rfdiffusion: {
    endpoint: "https://health.api.nvidia.com/v1/biology/ipd/rfdiffusion/generate",
    version: "2.0.0",
    docs: "https://docs.api.nvidia.com/nim/reference/ipd-rfdiffusion-infer",
  },
} as const

async function body(response: Response, limit = 25 * 1024 * 1024) {
  const declared = Number(response.headers.get("content-length"))
  if (Number.isFinite(declared) && declared > limit)
    throw new Error(`NVIDIA response exceeds the ${limit}-byte capture limit`)
  if (!response.body) return ""
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const value = await reader.read()
      if (value.done) break
      total += value.value.byteLength
      if (total > limit) throw new Error(`NVIDIA response exceeds the ${limit}-byte capture limit`)
      chunks.push(value.value)
    }
  } finally {
    reader.releaseLock()
  }
  const joined = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    joined.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(joined)
}

function artifacts(value: unknown) {
  const output: Array<{ extension: string; content: string }> = []
  const walk = (item: unknown) => {
    if (output.length >= 16) return
    if (typeof item === "string" && item.length <= 10 * 1024 * 1024) {
      const normalized = item.trimStart()
      if (/^(ATOM  |HETATM|HEADER)/m.test(normalized)) output.push({ extension: "pdb", content: item })
      else if (/^data_/m.test(normalized) || normalized.includes("_atom_site."))
        output.push({ extension: "cif", content: item })
      else if (normalized.includes("$$$$")) output.push({ extension: "sdf", content: item })
      else if (normalized.startsWith(">")) output.push({ extension: "fasta", content: item })
      return
    }
    if (Array.isArray(item)) for (const entry of item) walk(entry)
    else if (item && typeof item === "object") for (const entry of Object.values(item)) walk(entry)
  }
  walk(value)
  return output
}

export namespace BioNemoHosted {
  export function spec(id: ID) {
    return specs[BioNemoCapabilityID.parse(id)]
  }
  export async function doctor(id: ID) {
    const selected = spec(id),
      fields = await resolveCredentialFields("nvidia").catch(() => undefined)
    return {
      capability: id,
      provider: "nvidia",
      configured: Boolean(fields?.api_key?.trim()),
      endpoint: selected.endpoint,
      model_version: selected.version,
      docs_url: selected.docs,
      terms_url: TERMS,
      state: fields?.api_key?.trim() ? "ready" : "setup_needed",
      live_request_sent: false,
    }
  }
  export async function plan(id: ID, raw: unknown) {
    const selected = spec(id),
      payload = parseBioNemoInput(id, raw),
      state = await doctor(id)
    return {
      capability: id,
      provider: "nvidia",
      configured: state.configured,
      method: "POST",
      endpoint: selected.endpoint,
      model_version: selected.version,
      request_sha256: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      payload,
      terms_url: TERMS,
      warning:
        "NVIDIA trial-service terms apply. Do not submit regulated or restricted data unless your NVIDIA agreement permits it.",
      dispatched: false,
    }
  }
  export async function start(id: ID, sessionID: string, raw: unknown) {
    const selected = spec(id),
      payload = parseBioNemoInput(id, raw),
      fields = await resolveCredentialFields("nvidia"),
      key = fields?.api_key?.trim()
    if (!key) throw new Error(`NVIDIA NIM credential is not configured for ${id}`)
    const started = new Date().toISOString(),
      response = await fetch(selected.endpoint, {
        method: "POST",
        headers: { accept: "application/json", authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10 * 60 * 1000),
      })
    const text = await body(response)
    if (!response.ok)
      throw new Error(
        OpenScience.redactSecrets(`NVIDIA ${id} returned HTTP ${response.status}: ${text.slice(0, 2_000)}`),
      )
    let result: unknown
    try {
      result = JSON.parse(text)
    } catch {
      throw new Error(`NVIDIA ${id} returned a non-JSON success response`)
    }
    const relative = path.join("scientific-capabilities", `${id}-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`),
      root = path.join(await SessionFilesystem.workspace(sessionID), relative)
    await fs.mkdir(root, { recursive: true, mode: 0o700 })
    const files = [path.join(root, "response.json")]
    await Bun.write(files[0], JSON.stringify(result, null, 2), { mode: 0o600 })
    for (const [index, item] of artifacts(result).entries()) {
      const target = path.join(root, `artifact-${index + 1}.${item.extension}`)
      await Bun.write(target, item.content, { mode: 0o600 })
      files.push(target)
    }
    return {
      capability: id,
      provider: "nvidia",
      endpoint: selected.endpoint,
      model_version: selected.version,
      request_sha256: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"),
      started_at: started,
      completed_at: new Date().toISOString(),
      root: relative.split(path.sep).join("/"),
      artifacts: await Promise.all(
        files.map(async (file) => ({
          path: path.relative(root, file).split(path.sep).join("/"),
          size: (await fs.stat(file)).size,
          sha256: new Bun.CryptoHasher("sha256").update(await Bun.file(file).arrayBuffer()).digest("hex"),
          mime: file.endsWith(".json")
            ? "application/json"
            : file.endsWith(".pdb")
              ? "chemical/x-pdb"
              : file.endsWith(".cif")
                ? "chemical/x-mmcif"
                : file.endsWith(".sdf")
                  ? "chemical/x-mdl-sdfile"
                  : "text/plain",
        })),
      ),
    }
  }
}

export const BioNemoSpecs = specs
