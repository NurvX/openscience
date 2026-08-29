import { Global } from "@/global"
import { FileLease } from "@/util/file-lease"
import { Log } from "@/util/log"
import crypto from "node:crypto"
import { constants } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import type { KernelStartOptions } from "./types"

const log = Log.create({ service: "science.environment" })

const Language = z.enum(["python", "r"])
export type ManagedEnvironmentLanguage = z.infer<typeof Language>

const State = z.object({
  version: z.literal(1),
  status: z.enum(["absent", "installing", "ready", "failed"]),
  phase: z.string(),
  updated_at: z.string(),
  error: z.string().optional(),
})
export type ManagedEnvironmentState = z.infer<typeof State>

const Manifest = z.object({
  version: z.literal(1),
  name: z.string(),
  language: Language,
  kind: z.enum(["starter", "task"]),
  spec: z.string(),
  packages: z.string().array(),
  pip_packages: z.string().array().optional(),
  channels: z.string().array(),
  created_at: z.string(),
  verified_at: z.string(),
})

const STARTERS = {
  python: {
    name: "python",
    channels: ["conda-forge"],
    packages: ["python=3.11", "numpy", "pandas<3", "scipy", "matplotlib", "seaborn", "pillow", "pip"],
    probe: [
      "import json",
      "import numpy, pandas, scipy, matplotlib, seaborn",
      "from PIL import Image",
      'print(json.dumps({"ok": True}))',
    ].join("\n"),
  },
  r: {
    name: "r",
    channels: ["conda-forge", "bioconda"],
    packages: ["r-base", "r-tidyverse", "r-ggplot2", "r-jsonlite"],
    probe: 'suppressPackageStartupMessages({library(tidyverse); library(ggplot2); library(jsonlite)}); cat("ok")',
  },
} as const

const TaskName = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  .refine((value) => value !== "python" && value !== "r", "Use a distinct task environment name")
const TaskSpec = z
  .object({
    channels: z.array(z.string().trim().min(1)).min(1).max(8).default(["conda-forge"]),
    packages: z.array(z.string().trim().min(1)).min(1).max(64).default(["python=3.11", "pip"]),
    pip_packages: z
      .array(
        z
          .string()
          .trim()
          .regex(/^[A-Za-z0-9_.-]+==[^=<>!~\s]+$/, "Task pip packages must use exact version pins"),
      )
      .max(100)
      .default([]),
    pip_requirements: z.string().trim().min(1).max(100_000).optional(),
    lock_digest: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
  })
  .strict()
export type ManagedTaskSpec = z.infer<typeof TaskSpec>

const root = () => path.join(Global.Path.data, "conda")
const environmentRoot = () => path.join(root(), "envs")
const stagingRoot = () => path.join(root(), ".staging")
const rollbackRoot = () => path.join(root(), ".rollback")
const statePath = () => path.join(root(), "state.json")
const executableName = () => (process.platform === "win32" ? "micromamba.exe" : "micromamba")
const micromamba = () => path.join(root(), "bin", executableName())
const environmentPath = (name: string) => path.join(environmentRoot(), name)
const manifestPath = (name: string) => path.join(environmentPath(name), ".openscience-environment.json")

const MICROMAMBA_VERSION = "2.9.0"
const MICROMAMBA = {
  "osx-arm64": {
    archive: "500f5074feb8d02c4296ef9921c3650ed2874171805a9fbb8fbb53896433646b",
    binary: "ec2a072f028e1a7cf20f3e2e74d5a8127cf5a5f27636375b5359811565f4e5be",
  },
  "osx-64": {
    archive: "0426ecdc41636d369f57b8fe6acbf4385a69eca45b56d9ee7d3a840a9965d44f",
    binary: "1e71054bb3ac9a076e21f7ec48acfef536f9b3f1408f371a942784bf5ef83d8a",
  },
  "linux-aarch64": {
    archive: "e705ffeed90ce0659eb546e4b1e1028c9eaf0bc9cc854867b19ac5ce0ba5852f",
    binary: "9f93b974adcb4d166996af969b6cd371287d1a3e52733704727884d9b74cb7a7",
  },
  "linux-64": {
    archive: "8761c382127e6363bd9e0a2451aa3ef90d071a79133f736e2f759a3bf13040dd",
    binary: "366cd9cd8be14df1ab8ed50352a82111082a36686b2d389fdb79a92c3fafb3e3",
  },
  "win-64": {
    archive: "97a336f4ab794bd96a6a4da5e6ed63e75a1d31830414a182419b23d3b36f3fe0",
    binary: "a6d804394b2418991c4e29562853eaace2f2ce9d9da661a98e74e02e8dbb44b0",
  },
} as const

const platform = () => {
  if (process.platform === "darwin" && process.arch === "arm64") return "osx-arm64"
  if (process.platform === "darwin" && process.arch === "x64") return "osx-64"
  if (process.platform === "linux" && process.arch === "arm64") return "linux-aarch64"
  if (process.platform === "linux" && process.arch === "x64") return "linux-64"
  if (process.platform === "win32" && process.arch === "x64") return "win-64"
  throw new Error(`Managed scientific environments are not available on ${process.platform}/${process.arch}`)
}

async function sha256(file: string) {
  const bytes = await Bun.file(file).arrayBuffer()
  return new Bun.CryptoHasher("sha256").update(bytes).digest("hex")
}

async function installedMicromambaIsLocked() {
  const selectedPlatform = platform()
  const fixtureDigest =
    process.env.OPENSCIENCE_TEST_HOME && process.env.OPENSCIENCE_TEST_MANAGED_ENVIRONMENTS === "1"
      ? process.env.OPENSCIENCE_TEST_MICROMAMBA_SHA256
      : undefined
  const expected = fixtureDigest?.match(/^[a-f0-9]{64}$/u) ? fixtureDigest : MICROMAMBA[selectedPlatform].binary
  return (await executable(micromamba())) && (await sha256(micromamba()).catch(() => "")) === expected
}

async function executable(file: string) {
  return fs.access(file, process.platform === "win32" ? constants.F_OK : constants.X_OK).then(
    () => true,
    () => false,
  )
}

async function writeJson(file: string, value: unknown) {
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`
  await fs.mkdir(path.dirname(file), { recursive: true })
  await Bun.write(temporary, JSON.stringify(value, null, 2), { mode: 0o600 })
  await fs.rename(temporary, file).catch(async (error) => {
    await fs.rm(temporary, { force: true }).catch(() => undefined)
    throw error
  })
}

async function state(value?: Partial<ManagedEnvironmentState>) {
  if (!value) {
    const parsed = State.safeParse(
      await Bun.file(statePath())
        .json()
        .catch(() => undefined),
    )
    return parsed.success
      ? parsed.data
      : ({ version: 1, status: "absent", phase: "not_started", updated_at: new Date().toISOString() } as const)
  }
  const current = await state()
  const next = State.parse({ ...current, ...value, version: 1, updated_at: new Date().toISOString() })
  await writeJson(statePath(), next)
  return next
}

async function run(command: string[], options: { cwd?: string; timeout?: number } = {}) {
  const proc = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...process.env, MAMBA_ROOT_PREFIX: root(), MAMBA_NO_RC: "true" },
    stdout: "pipe",
    stderr: "pipe",
  })
  const timer = setTimeout(() => proc.kill(), options.timeout ?? 20 * 60 * 1000)
  const [stdout, stderr, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]).finally(() => clearTimeout(timer))
  if (exit === 0) return stdout
  throw new Error((stderr || stdout || `Command failed with exit ${exit}`).trim().slice(-4_000))
}

async function installMicromamba() {
  const selectedPlatform = platform()
  const locked = MICROMAMBA[selectedPlatform]
  if (await installedMicromambaIsLocked()) return micromamba()
  await state({ status: "installing", phase: "installing_micromamba", error: undefined })
  const archive = path.join(stagingRoot(), `micromamba-${crypto.randomUUID()}.tar.bz2`)
  const extracted = path.join(stagingRoot(), `micromamba-${crypto.randomUUID()}`)
  const replacement = `${micromamba()}.${process.pid}.${crypto.randomUUID()}.tmp`
  const previous = `${micromamba()}.${process.pid}.${crypto.randomUUID()}.previous`
  let preservePrevious = false
  try {
    await fs.mkdir(extracted, { recursive: true })
    const response = await fetch(`https://micro.mamba.pm/api/micromamba/${selectedPlatform}/${MICROMAMBA_VERSION}`, {
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    })
    if (!response.ok) throw new Error(`Micromamba download failed with HTTP ${response.status}`)
    await Bun.write(archive, await response.arrayBuffer(), { mode: 0o600 })
    if ((await sha256(archive)) !== locked.archive) {
      throw new Error(`Micromamba ${MICROMAMBA_VERSION} archive failed its ${selectedPlatform} checksum`)
    }
    await run(["tar", "-xf", archive, "-C", extracted], { timeout: 60_000 })
    const candidates = [
      path.join(extracted, "bin", "micromamba"),
      path.join(extracted, "Library", "bin", "micromamba.exe"),
      path.join(extracted, "micromamba.exe"),
    ]
    const source = (
      await Promise.all(candidates.map(async (file) => ((await executable(file)) ? file : undefined)))
    ).find((file): file is string => !!file)
    if (!source) throw new Error("The official micromamba archive did not contain the expected executable")
    if ((await sha256(source)) !== locked.binary) {
      throw new Error(`Micromamba ${MICROMAMBA_VERSION} executable failed its ${selectedPlatform} checksum`)
    }
    await fs.mkdir(path.dirname(micromamba()), { recursive: true })
    await fs.copyFile(source, replacement)
    if (process.platform !== "win32") await fs.chmod(replacement, 0o755)
    const hadPrevious = !!(await fs.stat(micromamba()).catch(() => undefined))
    if (hadPrevious) await fs.rename(micromamba(), previous)
    try {
      await fs.rename(replacement, micromamba())
    } catch (error) {
      if (hadPrevious) {
        try {
          await fs.rename(previous, micromamba())
        } catch (restoreError) {
          preservePrevious = true
          throw new AggregateError(
            [error, restoreError],
            `Micromamba replacement failed and the previous verified binary remains at ${previous}`,
          )
        }
      }
      throw error
    }
    if (hadPrevious)
      await fs.rm(previous, { force: true }).catch((error) => {
        log.warn("failed to remove replaced micromamba rollback", { previous, error: String(error) })
      })
    return micromamba()
  } finally {
    await fs.rm(archive, { force: true }).catch(() => undefined)
    await fs.rm(extracted, { recursive: true, force: true }).catch(() => undefined)
    await fs.rm(replacement, { force: true }).catch(() => undefined)
    if (!preservePrevious) await fs.rm(previous, { force: true }).catch(() => undefined)
  }
}

async function probe(language: ManagedEnvironmentLanguage, prefix = environmentPath(language)) {
  const binary =
    language === "python"
      ? path.join(prefix, process.platform === "win32" ? "python.exe" : "bin/python")
      : path.join(prefix, process.platform === "win32" ? "Scripts/Rscript.exe" : "bin/Rscript")
  if (!(await executable(binary))) return false
  const command = language === "python" ? [binary, "-I", "-c", STARTERS.python.probe] : [binary, "-e", STARTERS.r.probe]
  return run(command, { timeout: 30_000 }).then(
    () => true,
    () => false,
  )
}

async function replaceEnvironment(target: string, create: () => Promise<void>) {
  await fs.mkdir(environmentRoot(), { recursive: true })
  const previous = path.join(rollbackRoot(), `${path.basename(target)}-${Date.now()}-${crypto.randomUUID()}`)
  const hadPrevious = !!(await fs.stat(target).catch(() => undefined))
  if (hadPrevious) {
    await fs.mkdir(rollbackRoot(), { recursive: true })
    await fs.rename(target, previous)
  }
  try {
    // Conda environments contain absolute prefixes (including Mach-O dylib
    // install names on macOS). Solve directly at the durable path: renaming a
    // staged prefix makes an otherwise valid environment unlaunchable.
    await create()
  } catch (error) {
    await fs.rm(target, { recursive: true, force: true }).catch(() => undefined)
    if (hadPrevious) await fs.rename(previous, target).catch(() => undefined)
    throw error
  }
  if (hadPrevious) {
    await fs.rm(previous, { recursive: true, force: true }).catch((error) => {
      log.warn("failed to remove replaced environment rollback", { previous, error: String(error) })
    })
  }
}

async function ensureStarter(language: ManagedEnvironmentLanguage) {
  if (await probe(language)) return
  const spec = STARTERS[language]
  await state({ status: "installing", phase: `provisioning_${language}`, error: undefined })
  const target = environmentPath(language)
  const channels = spec.channels.flatMap((channel) => ["-c", channel])
  await replaceEnvironment(target, async () => {
    await run([await installMicromamba(), "--no-rc", "create", "-y", "-p", target, ...channels, ...spec.packages])
    if (!(await probe(language, target))) throw new Error(`${language} starter environment failed its import probe`)
    const now = new Date().toISOString()
    const digest = crypto
      .createHash("sha256")
      .update(JSON.stringify({ channels: spec.channels, packages: spec.packages }))
      .digest("hex")
    await writeJson(path.join(target, ".openscience-environment.json"), {
      version: 1,
      name: spec.name,
      language,
      kind: "starter",
      spec: digest,
      packages: [...spec.packages],
      channels: [...spec.channels],
      created_at: now,
      verified_at: now,
    } satisfies z.infer<typeof Manifest>)
  })
}

async function ensureTaskEnvironment(name: string, raw?: ManagedTaskSpec) {
  const target = environmentPath(name)
  const binary = path.join(target, process.platform === "win32" ? "python.exe" : "bin/python")
  const spec = TaskSpec.parse({
    channels: raw?.channels ?? ["conda-forge"],
    packages: raw?.packages ?? ["python=3.11", "pip"],
    pip_packages: raw?.pip_packages ?? [],
    pip_requirements: raw?.pip_requirements,
    lock_digest: raw?.lock_digest,
  })
  const digest = crypto
    .createHash("sha256")
    .update(
      JSON.stringify({
        channels: spec.channels,
        packages: spec.packages,
        pip_packages: spec.pip_packages,
        pip_requirements: spec.pip_requirements,
      }),
    )
    .digest("hex")
  if (spec.lock_digest && spec.lock_digest !== digest) {
    throw new Error(`Task environment '${name}' lock digest does not match its hashed package specification`)
  }
  const current = Manifest.safeParse(
    await Bun.file(path.join(target, ".openscience-environment.json"))
      .json()
      .catch(() => undefined),
  )
  if (
    (await executable(binary)) &&
    (await run([binary, "-I", "-c", 'print("ok")'], { timeout: 30_000 }).then(
      () => true,
      () => false,
    )) &&
    current.success &&
    current.data.kind === "task" &&
    current.data.spec === digest
  )
    return
  await state({ status: "installing", phase: `provisioning_task:${name}`, error: undefined })
  await replaceEnvironment(target, async () => {
    const channels = spec.channels.flatMap((channel) => ["-c", channel])
    await run([await installMicromamba(), "--no-rc", "create", "-y", "-p", target, ...channels, ...spec.packages])
    if (!(await executable(binary))) throw new Error(`Task environment '${name}' did not contain Python`)
    if (spec.pip_packages.length) {
      if (!spec.pip_requirements) {
        await run(
          [
            binary,
            "-m",
            "pip",
            "install",
            "--disable-pip-version-check",
            "--no-cache-dir",
            "--no-deps",
            ...spec.pip_packages,
          ],
          { timeout: 45 * 60 * 1000 },
        )
      } else {
        const requirements = path.join(stagingRoot(), `requirements-${crypto.randomUUID()}.txt`)
        await Bun.write(requirements, spec.pip_requirements, { mode: 0o600 })
        try {
          await run(
            [
              binary,
              "-m",
              "pip",
              "install",
              "--disable-pip-version-check",
              "--no-cache-dir",
              "--no-deps",
              "--only-binary=:all:",
              "--require-hashes",
              "-r",
              requirements,
            ],
            { timeout: 45 * 60 * 1000 },
          )
        } finally {
          await fs.rm(requirements, { force: true }).catch(() => undefined)
        }
      }
    }
    await run([binary, "-I", "-c", 'print("ok")'], { timeout: 30_000 })
    const now = new Date().toISOString()
    await writeJson(path.join(target, ".openscience-environment.json"), {
      version: 1,
      name,
      language: "python",
      kind: "task",
      spec: digest,
      packages: [...spec.packages],
      pip_packages: [...spec.pip_packages],
      channels: [...spec.channels],
      created_at: now,
      verified_at: now,
    } satisfies z.infer<typeof Manifest>)
  })
}

const micromambaSetup: { value?: Promise<void> } = {}
const starterSetup: Partial<Record<ManagedEnvironmentLanguage, Promise<void>>> = {}

async function ensureMicromamba() {
  if (await installedMicromambaIsLocked()) return
  if (micromambaSetup.value) {
    await micromambaSetup.value
    if (await installedMicromambaIsLocked()) return
    micromambaSetup.value = undefined
  }
  const current = (async () => {
    await fs.mkdir(root(), { recursive: true })
    await using lease = await FileLease.acquire(path.join(root(), "micromamba.lock"), 45 * 60 * 1000)
    await installMicromamba()
  })()
  micromambaSetup.value = current
  try {
    await current
  } catch (error) {
    if (micromambaSetup.value === current) micromambaSetup.value = undefined
    throw error
  }
}

async function ensureLanguage(language: ManagedEnvironmentLanguage) {
  const existing = starterSetup[language]
  if (existing) return existing
  const current = (async () => {
    await fs.mkdir(root(), { recursive: true })
    await ensureMicromamba()
    await using lease = await FileLease.acquire(path.join(root(), `starter-${language}.lock`), 45 * 60 * 1000)
    try {
      await ensureStarter(language)
      await state({ status: "ready", phase: `ready:${language}`, error: undefined })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await state({ status: "failed", phase: `failed:${language}`, error: message }).catch(() => undefined)
      throw error
    }
  })()
  starterSetup[language] = current
  try {
    await current
  } catch (error) {
    if (starterSetup[language] === current) delete starterSetup[language]
    throw error
  }
}

export namespace ManagedEnvironments {
  export const pythonPackages = [...STARTERS.python.packages]
  export const rPackages = [...STARTERS.r.packages]

  export async function bootstrap() {
    if (process.env.OPENSCIENCE_SKIP_ENVIRONMENT_BOOTSTRAP === "1") return
    if (process.env.OPENSCIENCE_TEST_HOME && process.env.OPENSCIENCE_TEST_MANAGED_ENVIRONMENTS !== "1") return
    await ensureLanguage("python")
    await ensureLanguage("r")
    await state({ status: "ready", phase: "ready", error: undefined })
  }

  export async function status() {
    const current = await state()
    const environments = await Promise.all(
      (["python", "r"] as const).map(async (language) => {
        const manifest = Manifest.safeParse(
          await Bun.file(manifestPath(language))
            .json()
            .catch(() => undefined),
        )
        return {
          language,
          ready: await probe(language),
          path: environmentPath(language),
          packages: [...STARTERS[language].packages],
          manifest: manifest.success ? manifest.data : null,
        }
      }),
    )
    return { ...current, environments }
  }

  /** Create a machine-wide named Python environment only after the caller has
   * obtained package-install approval. Subsequent projects and sessions reuse
   * it; normal execution never creates environments as a side effect. */
  export async function ensureTask(name: string, spec?: ManagedTaskSpec) {
    const parsed = TaskName.parse(name)
    if (process.env.OPENSCIENCE_TEST_HOME && process.env.OPENSCIENCE_TEST_MANAGED_ENVIRONMENTS !== "1") return
    await ensureMicromamba()
    await using lease = await FileLease.acquire(path.join(root(), `task-${parsed}.lock`), 45 * 60 * 1000)
    await ensureTaskEnvironment(parsed, spec)
    await state({ status: "ready", phase: "ready", error: undefined })
  }

  export async function inspect(name: string) {
    const parsed = TaskName.parse(name)
    const target = environmentPath(parsed)
    const binary = path.join(target, process.platform === "win32" ? "python.exe" : "bin/python")
    const manifest = Manifest.safeParse(
      await Bun.file(path.join(target, ".openscience-environment.json"))
        .json()
        .catch(() => undefined),
    )
    return {
      name: parsed,
      path: target,
      ready:
        (await executable(binary)) &&
        (await run([binary, "-I", "-c", 'print("ok")'], { timeout: 30_000 }).then(
          () => true,
          () => false,
        )),
      manifest: manifest.success ? manifest.data : null,
    }
  }

  export async function runtime(
    language: ManagedEnvironmentLanguage,
    environment: string = language,
  ): Promise<KernelStartOptions> {
    if (process.env.OPENSCIENCE_TEST_HOME && process.env.OPENSCIENCE_TEST_MANAGED_ENVIRONMENTS !== "1") {
      if (environment !== language) {
        throw new Error(`Task environment '${environment}' is unavailable`)
      }
      return { environmentName: environment }
    }
    if (environment === language) await ensureLanguage(language)
    const prefix = environmentPath(environment)
    let binary =
      language === "python"
        ? path.join(prefix, process.platform === "win32" ? "python.exe" : "bin/python")
        : path.join(prefix, process.platform === "win32" ? "Scripts/Rscript.exe" : "bin/Rscript")
    if (environment === language && !(await executable(binary))) {
      delete starterSetup[language]
      await ensureLanguage(language)
      binary =
        language === "python"
          ? path.join(prefix, process.platform === "win32" ? "python.exe" : "bin/python")
          : path.join(prefix, process.platform === "win32" ? "Scripts/Rscript.exe" : "bin/Rscript")
    }
    if (!(await executable(binary))) {
      throw new Error(
        environment === language
          ? `Managed ${language} environment '${environment}' is unavailable. Open Settings → Compute to repair it.`
          : `Task environment '${environment}' is unavailable. Ask OpenScience to install its initial packages before using it.`,
      )
    }
    const bin = path.dirname(binary)
    return {
      binary,
      environmentName: environment,
      env: {
        CONDA_PREFIX: prefix,
        PATH: [bin, process.env.PATH].filter(Boolean).join(path.delimiter),
        MAMBA_ROOT_PREFIX: root(),
      },
    }
  }

  export function startInBackground() {
    void bootstrap().catch((error) => log.warn("starter environment setup failed", { error: String(error) }))
  }
}
