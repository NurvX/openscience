import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { BioNemoHostedDispatch } from "../../src/science/bionemo/dispatch"

describe("hosted BioNeMo adapters", () => {
  test("keeps the NVIDIA credential in-process, validates the request, and captures bounded artifacts", async () => {
    await using tmp = await tmpdir()
    const project = path.join(tmp.path, "project")
    const data = path.join(tmp.path, "data")
    const runner = path.join(tmp.path, "bionemo-runner.ts")
    await fs.mkdir(project)
    const credentials = new URL("../../src/server/routes/settings/credentials.ts", import.meta.url).href
    const hosted = new URL("../../src/science/bionemo/client.ts", import.meta.url).href
    const dispatch = new URL("../../src/science/bionemo/dispatch.ts", import.meta.url).href
    const instance = new URL("../../src/project/instance.ts", import.meta.url).href
    const trust = new URL("../../src/project/trust.ts", import.meta.url).href
    const sessionModule = new URL("../../src/session/index.ts", import.meta.url).href
    const filesystem = new URL("../../src/session/filesystem.ts", import.meta.url).href
    await Bun.write(
      runner,
      `
import fs from "node:fs/promises"
import path from "node:path"
import { CredentialsRoutes } from ${JSON.stringify(credentials)}
import { BioNemoHosted } from ${JSON.stringify(hosted)}
import { BioNemoHostedDispatch } from ${JSON.stringify(dispatch)}
import { Instance } from ${JSON.stringify(instance)}
import { ProjectTrust } from ${JSON.stringify(trust)}
import { Session } from ${JSON.stringify(sessionModule)}
import { SessionFilesystem } from ${JSON.stringify(filesystem)}

const secret = "nvapi-hosted-test-secret"
const app = CredentialsRoutes()
const saved = await app.request("/nvidia", {
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ fields: { api_key: secret } }),
})
const savedText = await saved.text()
if (!saved.ok || savedText.includes(secret)) throw new Error("NVIDIA credential save leaked or failed")
if (process.env.NVIDIA_API_KEY) throw new Error("NVIDIA credential entered process.env")

let requests = 0
globalThis.fetch = async (input, init) => {
  requests++
  if (String(input) !== "https://health.api.nvidia.com/v1/biology/mit/boltz2/predict") throw new Error("wrong endpoint")
  if (init?.method !== "POST") throw new Error("wrong method")
  if (init?.redirect !== "error") throw new Error("redirect policy changed")
  if (new Headers(init?.headers).get("authorization") !== "Bearer " + secret) throw new Error("credential missing")
  const payload = JSON.parse(String(init?.body))
  if (payload.polymers?.[0]?.sequence !== "MVLTIYPDELVQIVSDKK") throw new Error("payload changed")
  return new Response(JSON.stringify({ structure: "HEADER    TEST\\nATOM      1  CA  ALA A   1      0.000   0.000   0.000\\n" }), {
    headers: { "content-type": "application/json" },
  })
}

await Instance.provide({
  directory: process.argv[2],
  init: async () => {
    const current = await ProjectTrust.status(Instance.project)
    await ProjectTrust.update(Instance.project, { trusted: true, root: current.root })
  },
  fn: async () => {
    const doctor = await BioNemoHosted.doctor("boltz2")
    if (!doctor.configured || doctor.state !== "configured" || doctor.live_request_sent)
      throw new Error("doctor overstated or missed configuration")
    const session = await Session.create({})
    const result = await BioNemoHosted.start("boltz2", session.id, {
      polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKK" }],
    })
    if (requests !== 1 || result.artifacts.length !== 2) throw new Error("unexpected hosted capture")
    const cached = await BioNemoHosted.start("boltz2", session.id, {
      polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKK" }],
    })
    if (requests !== 1 || cached.request_sha256 !== result.request_sha256) throw new Error("exact success did not replay locally")
    if (JSON.stringify(result).includes(secret)) throw new Error("result leaked NVIDIA credential")
    const root = path.join(await SessionFilesystem.workspace(session.id), result.root)
    const response = await fs.readFile(path.join(root, "response.json"), "utf8")
    const pdb = await fs.readFile(path.join(root, "artifact-1.pdb"), "utf8")
    if (!response.includes("structure") || !pdb.startsWith("HEADER")) throw new Error("artifacts were not captured")

    globalThis.fetch = async () => new Response("provider rejected " + secret, { status: 401 })
    let failure = ""
    try {
      await BioNemoHosted.start("boltz2", session.id, {
        polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKKA" }],
      })
    } catch (error) {
      failure = error instanceof Error ? error.message : String(error)
    }
    if (!failure || failure.includes(secret)) throw new Error("provider failure leaked NVIDIA credential")

    globalThis.fetch = async () =>
      new Response("", { headers: { "content-length": String(26 * 1024 * 1024) } })
    let bounded = false
    try {
      await BioNemoHosted.start("boltz2", session.id, {
        polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKKAA" }],
      })
    } catch (error) {
      bounded = String(error).includes("capture limit")
    }
    if (!bounded) throw new Error("oversized response was accepted")

    globalThis.fetch = async () =>
      new Response("", { status: 307, headers: { location: "https://redirected.example" } })
    let redirected = false
    try {
      await BioNemoHosted.start("boltz2", session.id, {
        polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKKAAG" }],
      })
    } catch (error) {
      redirected = String(error).includes("redirect")
    }
    if (!redirected) throw new Error("redirect was accepted")

    const preview = await BioNemoHosted.plan("boltz2", {
      polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKKAAGG" }],
    })
    await BioNemoHostedDispatch.begin({ preview, sessionID: session.id })
    const beforePending = requests
    let pending = ""
    try {
      await BioNemoHosted.start("boltz2", session.id, {
        polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKKAAGG" }],
      })
    } catch (error) {
      pending = error instanceof Error ? error.message : String(error)
    }
    if (!pending.includes("previously recorded this exact hosted") || requests !== beforePending)
      throw new Error("pending dispatch was resent")
  },
})
`,
    )

    const childEnv = { ...process.env }
    delete childEnv.NVIDIA_API_KEY
    const proc = Bun.spawn([process.execPath, runner, project], {
      cwd: project,
      env: {
        ...childEnv,
        OPENSCIENCE_DATA_DIR: data,
        OPENSCIENCE_CONFIG_DIR: path.join(tmp.path, "config"),
        OPENSCIENCE_TEST_HOME: path.join(tmp.path, "home"),
        XDG_STATE_HOME: path.join(tmp.path, "state"),
        XDG_CACHE_HOME: path.join(tmp.path, "cache"),
      },
      stdout: "pipe",
      stderr: "pipe",
    })
    const [exit, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    expect(exit, `${stdout}\n${stderr}`).toBe(0)
    expect(await Bun.file(path.join(data, "credentials.json")).text()).not.toContain("nvapi-hosted-test-secret")
  }, 20_000)

  test("rejects unknown fields and over-broad request sizes before a provider call", async () => {
    const { parseBioNemoInput } = await import("../../src/science/bionemo/schema")
    expect(() => parseBioNemoInput("diffdock", { protein: "ATOM", ligand: "CCO", unexpected: true })).toThrow()
    expect(() => parseBioNemoInput("rfdiffusion", { contigs: "100-100", diffusion_steps: 51 })).toThrow()
    expect(() =>
      parseBioNemoInput("boltz2", {
        polymers: [{ molecule_type: "protein", sequence: "A".repeat(4_097) }],
      }),
    ).toThrow()
  })

  test("records unknown dispatch state after a transport failure and blocks an identical retry", async () => {
    await using tmp = await tmpdir({ git: true })
    const originalFetch = globalThis.fetch
    try {
      const { CredentialsRoutes } = await import("../../src/server/routes/settings/credentials")
      const { Instance } = await import("../../src/project/instance")
      const { ProjectTrust } = await import("../../src/project/trust")
      const { Session } = await import("../../src/session")
      const { BioNemoHosted } = await import("../../src/science/bionemo/client")
      await Instance.provide({
        directory: tmp.path,
        init: async () => {
          const current = await ProjectTrust.status(Instance.project)
          await ProjectTrust.update(Instance.project, { trusted: true, root: current.root })
        },
        fn: async () => {
          const app = CredentialsRoutes()
          await app.request("/nvidia", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ fields: { api_key: "nvapi-hosted-test-secret" } }),
          })
          const session = await Session.create({})
          let requests = 0
          globalThis.fetch = ((async () => {
            requests++
            throw new Error("socket hang up")
          }) as unknown) as typeof fetch
          await expect(
            BioNemoHosted.start("boltz2", session.id, {
              polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKK" }],
            }),
          ).rejects.toThrow("socket hang up")
          await expect(
            BioNemoHosted.start("boltz2", session.id, {
              polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKK" }],
            }),
          ).rejects.toThrow("previously recorded this exact hosted")
          expect(requests).toBe(1)
        },
      })
    } finally {
      globalThis.fetch = originalFetch
    }
  })
})
