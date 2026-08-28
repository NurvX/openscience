import { ManagedEnvironments } from "@/science/kernel/environment-manager"
import { CapabilityEvidence } from "./evidence"
import type { CapabilityManifest, CapabilityRuntime as Runtime } from "./schema"

const same = (left: readonly string[] | undefined, right: readonly string[]) => JSON.stringify([...(left ?? [])].toSorted()) === JSON.stringify([...right].toSorted())
const localReady = (runtime: Runtime, state: Awaited<ReturnType<typeof ManagedEnvironments.inspect>>) => Boolean(state.ready && state.manifest && same(state.manifest.packages, [`python=${runtime.python}`, "pip=25.1.1"]) && same(state.manifest.pip_packages, runtime.packages))
async function modal(runtime: Runtime) {
  if (!runtime.targets.includes("modal")) return { state: "not_applicable" as const, configured: false, enabled: false }
  const { ComputeSettings } = await import("@/server/routes/settings/compute")
  const provider = (await ComputeSettings.get()).providers.find((item) => item.id === "modal")
  return { state: provider?.connected && provider.enabled ? ("ready" as const) : ("setup_needed" as const), configured: Boolean(provider?.connected), enabled: Boolean(provider?.enabled) }
}
async function versions(binary: string, pins: readonly string[]) {
  const names = pins.map((item) => item.slice(0, item.indexOf("==")))
  const code = ["import importlib.metadata, json, platform", `names = ${JSON.stringify(names)}`, "print(json.dumps({'python': platform.python_version(), 'packages': {name: importlib.metadata.version(name) for name in names}}, sort_keys=True))"].join("\n")
  const process = Bun.spawn([binary, "-I", "-c", code], { stdin: "ignore", stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, exit] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited])
  if (exit !== 0) throw new Error((stderr || stdout || `Runtime verification failed with exit ${exit}`).trim())
  return JSON.parse(stdout) as { python: string; packages: Record<string, string> }
}
export namespace CapabilityRuntime {
  export async function doctor(manifest: CapabilityManifest) {
    const evidence = await CapabilityEvidence.forCapability(manifest.id)
    if (!manifest.runtime) return { capability: manifest.id, maturity: manifest.maturity, availability: manifest.availability, local: { state: manifest.availability.local }, hosted: { state: manifest.availability.hosted }, setup: manifest.setup ?? null, blocker: manifest.blocker ?? null, evidence }
    const state = await ManagedEnvironments.inspect(manifest.runtime.pack_id), ready = manifest.runtime.targets.includes("local") && localReady(manifest.runtime, state), hosted = await modal(manifest.runtime)
    return { capability: manifest.id, maturity: manifest.maturity, availability: { local: manifest.runtime.targets.includes("local") ? ready ? "ready" : "setup_needed" : "not_applicable", hosted: hosted.state }, local: { state: ready ? "ready" : "setup_needed", environment: manifest.runtime.pack_id, path: state.path, manifest: state.manifest }, hosted, runtime: { python: manifest.runtime.python, image: manifest.runtime.image, lock_digest: manifest.runtime.lock_digest, packages: manifest.runtime.packages, resources: manifest.runtime.resources }, evidence }
  }
  export async function setup(manifest: CapabilityManifest) {
    if (manifest.maturity === "blocked") throw new Error(manifest.blocker ?? `${manifest.name} is blocked`)
    const runtime = manifest.runtime; if (!runtime?.targets.includes("local")) throw new Error(manifest.setup?.instructions ?? `${manifest.name} has no packaged local setup`)
    await ManagedEnvironments.ensureTask(runtime.pack_id, { channels: ["conda-forge"], packages: [`python=${runtime.python}`, "pip=25.1.1"], pip_packages: [...runtime.packages] })
    const environment = await ManagedEnvironments.runtime("python", runtime.pack_id); if (!environment.binary) throw new Error(`${runtime.pack_id} did not expose Python after setup`)
    const installed = await versions(environment.binary, runtime.packages); if (installed.python !== runtime.python) throw new Error(`${runtime.pack_id} installed Python ${installed.python}, expected ${runtime.python}`)
    for (const pin of runtime.packages) { const offset = pin.indexOf("=="), name = pin.slice(0, offset), expected = pin.slice(offset + 2); if (installed.packages[name] !== expected) throw new Error(`${runtime.pack_id} installed ${name}==${installed.packages[name]}, expected ${pin}`) }
    return { capability: manifest.id, state: "ready" as const, environment: runtime.pack_id, python: installed.python, packages: installed.packages, lock_digest: runtime.lock_digest }
  }
}
