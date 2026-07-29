import { spawn, type ChildProcess } from "node:child_process"
import crypto from "node:crypto"
import { createReadStream } from "node:fs"
import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { Global } from "../global"
import { OpenScience } from "../openscience"
import { Shell } from "../shell/shell"

export namespace ComputeJobs {
  export const Scheduler = z.enum(["none", "slurm", "pbs"])
  export type Scheduler = z.infer<typeof Scheduler>

  export const Host = z.object({
    id: z.string(),
    label: z.string(),
    host: z.string(),
    user: z.string().optional(),
    port: z.number().int().positive().optional(),
    scheduler: Scheduler.default("none"),
    workdir: z.string().optional(),
  })
  export type Host = z.infer<typeof Host>

  export const Probe = z.object({
    ok: z.boolean(),
    host: z.string(),
    latency_ms: z.number().nonnegative(),
    hostname: z.string().optional(),
    python: z.boolean(),
    gpu: z.boolean(),
    slurm: z.boolean(),
    pbs: z.boolean(),
    error: z.string().optional(),
  })
  export type Probe = z.infer<typeof Probe>

  export const Target = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("local") }),
    z.object({ kind: z.literal("ssh"), host_id: z.string() }),
  ])
  export type Target = z.infer<typeof Target>

  export const Resources = z.object({
    cpus: z.number().int().min(1).max(1024).optional(),
    gpus: z.number().int().min(0).max(128).optional(),
    memory_gb: z.number().min(0.1).max(100_000).optional(),
    time_minutes: z
      .number()
      .int()
      .min(1)
      .max(60 * 24 * 30)
      .optional(),
    partition: z.string().trim().min(1).max(120).optional(),
  })
  export type Resources = z.infer<typeof Resources>

  export const Artifact = z.object({
    path: z.string(),
    size: z.number().int().nonnegative(),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    modified_at: z.string(),
  })
  export type Artifact = z.infer<typeof Artifact>

  export const Reproducibility = z.object({
    captured_at: z.string(),
    command: z.string(),
    cwd: z.string(),
    platform: z.string(),
    arch: z.string(),
    bun: z.string(),
    node: z.string(),
    python: z.string().optional(),
    git: z
      .object({
        branch: z.string().optional(),
        commit: z.string().optional(),
        dirty: z.boolean(),
      })
      .optional(),
    lockfiles: Artifact.array(),
    resources: Resources.optional(),
  })
  export type Reproducibility = z.infer<typeof Reproducibility>

  export const Input = z.object({
    name: z.string().trim().min(1).max(120),
    command: z.string().trim().min(1).max(100_000),
    cwd: z.string().optional(),
    target: Target,
    resources: Resources.optional(),
    modules: z.array(z.string().trim().min(1).max(240)).max(64).optional(),
    container: z.string().trim().min(1).max(2_000).optional(),
    artifacts: z.array(z.string().trim().min(1).max(2_000)).max(100).optional(),
    checkpoint: z.string().trim().min(1).max(2_000).optional(),
  })
  export type Input = z.infer<typeof Input>

  export const Status = z.enum(["queued", "running", "succeeded", "failed", "cancelled", "interrupted"])
  export type Status = z.infer<typeof Status>

  export const Job = z.object({
    id: z.string(),
    name: z.string(),
    command: z.string(),
    cwd: z.string().optional(),
    target: Target,
    target_label: z.string(),
    scheduler: Scheduler,
    status: Status,
    created_at: z.string(),
    started_at: z.string().optional(),
    completed_at: z.string().optional(),
    exit_code: z.number().int().nullable().optional(),
    pid: z.number().int().positive().optional(),
    error: z.string().optional(),
    resources: Resources.optional(),
    modules: z.array(z.string()).optional(),
    container: z.string().optional(),
    artifact_patterns: z.array(z.string()).optional(),
    artifacts: Artifact.array().optional(),
    checkpoint_path: z.string().optional(),
    checkpoint: Artifact.optional(),
    reproducibility: Reproducibility.optional(),
    capture_error: z.string().optional(),
  })
  export type Job = z.infer<typeof Job>

  type Options = {
    root?: string
    hosts?: Host[]
  }

  type Runtime = {
    process: ChildProcess
    detached: boolean
    host?: Host
  }

  const active = new Map<string, Runtime>()
  const locks = new Map<string, Promise<void>>()
  const terminal = new Set<Status>(["succeeded", "failed", "cancelled", "interrupted"])

  const rootOf = (root?: string) => root ?? path.join(Global.Path.data, "compute")
  const metaOf = (root: string) => path.join(root, "jobs.json")
  const logsOf = (root: string) => path.join(root, "jobs")
  const exitOf = (root: string, id: string) => path.join(logsOf(root), `${id}.exit`)
  const keyOf = (root: string, id: string) => `${root}\0${id}`

  async function read(root: string): Promise<Job[]> {
    const value = await Bun.file(metaOf(root))
      .json()
      .catch(() => [])
    const result = Job.array().safeParse(value)
    return result.success ? result.data : []
  }

  async function write(root: string, jobs: Job[]): Promise<void> {
    await fs.mkdir(root, { recursive: true })
    await Bun.write(metaOf(root), JSON.stringify(jobs, null, 2), { mode: 0o600 })
  }

  async function change<T>(root: string, edit: (jobs: Job[]) => T | Promise<T>): Promise<T> {
    const prior = locks.get(root) ?? Promise.resolve()
    const task = prior
      .catch(() => undefined)
      .then(async () => {
        const jobs = await read(root)
        const result = await edit(jobs)
        await write(root, jobs)
        return result
      })
    locks.set(
      root,
      task.then(
        () => undefined,
        () => undefined,
      ),
    )
    return task
  }

  async function patch(root: string, id: string, value: Partial<Job>): Promise<Job> {
    return change(root, (jobs) => {
      const index = jobs.findIndex((job) => job.id === id)
      if (index < 0) throw new Error(`Compute job ${id} was not found`)
      const next = Job.parse({ ...jobs[index], ...value })
      jobs[index] = next
      return next
    })
  }

  function alive(pid: number): boolean {
    try {
      process.kill(pid, 0)
      return true
    } catch {
      return false
    }
  }

  async function sync(root: string): Promise<void> {
    const jobs = await read(root)
    const updates = (
      await Promise.all(
        jobs.map(async (job): Promise<{ id: string; value: Partial<Job> } | undefined> => {
          if (terminal.has(job.status) || active.has(keyOf(root, job.id))) return
          if (job.status === "queued" && Date.now() - Date.parse(job.created_at) < 5_000) return
          const marker = await Bun.file(exitOf(root, job.id))
            .text()
            .catch(() => undefined)
          const exit = marker?.trim().match(/^-?\d+$/) ? Number(marker.trim()) : undefined
          if (job.target.kind === "local" && exit !== undefined) {
            return {
              id: job.id,
              value: {
                status: exit === 0 ? "succeeded" : "failed",
                completed_at: new Date().toISOString(),
                exit_code: exit,
                pid: undefined,
              },
            }
          }
          if (job.target.kind === "local" && job.pid && alive(job.pid)) return
          return {
            id: job.id,
            value: {
              status: "interrupted",
              completed_at: new Date().toISOString(),
              exit_code: null,
              pid: undefined,
              error:
                job.target.kind === "ssh"
                  ? "The app connection ended before this remote job reported a result. Check the remote scheduler before rerunning it."
                  : "The job process ended before it could report a result.",
            },
          }
        }),
      )
    ).filter((item): item is { id: string; value: Partial<Job> } => !!item)
    if (!updates.length) return
    await change(root, (current) => {
      for (const update of updates) {
        const index = current.findIndex((job) => job.id === update.id)
        if (index < 0 || terminal.has(current[index]!.status) || active.has(keyOf(root, update.id))) continue
        current[index] = Job.parse({ ...current[index], ...update.value })
      }
    })
  }

  export function quote(value: string): string {
    return `'${value.replaceAll("'", `'\"'\"'`)}'`
  }

  function name(value: string): string {
    const clean = value
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 42)
    return clean || "job"
  }

  function clock(minutes: number): string {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}:00`
  }

  function workload(input: { command: string; modules?: string[]; container?: string }): string {
    const modules = input.modules?.length ? `module load ${input.modules.map(quote).join(" ")}` : undefined
    const command = input.container
      ? `apptainer exec ${quote(input.container)} bash -lc ${quote(input.command)}`
      : input.command
    return [modules, command].filter((part): part is string => !!part).join(" && ")
  }

  function slurm(input: { resources?: Resources }): string[] {
    const resources = input.resources
    if (!resources) return []
    return [
      resources.cpus ? `--cpus-per-task=${resources.cpus}` : undefined,
      resources.gpus ? `--gres=gpu:${resources.gpus}` : undefined,
      resources.memory_gb ? `--mem=${resources.memory_gb}G` : undefined,
      resources.time_minutes ? `--time=${clock(resources.time_minutes)}` : undefined,
      resources.partition ? `--partition=${quote(resources.partition)}` : undefined,
    ].filter((part): part is string => !!part)
  }

  function pbs(input: { resources?: Resources }): string[] {
    const resources = input.resources
    if (!resources) return []
    const select = [
      "select=1",
      resources.cpus ? `ncpus=${resources.cpus}` : undefined,
      resources.gpus ? `ngpus=${resources.gpus}` : undefined,
      resources.memory_gb ? `mem=${resources.memory_gb}gb` : undefined,
    ]
      .filter((part): part is string => !!part)
      .join(":")
    return [
      select === "select=1" ? undefined : `-l ${quote(select)}`,
      resources.time_minutes ? `-l ${quote(`walltime=${clock(resources.time_minutes)}`)}` : undefined,
    ].filter((part): part is string => !!part)
  }

  function remote(
    input: {
      id: string
      name: string
      command: string
      cwd?: string
      resources?: Resources
      modules?: string[]
      container?: string
    },
    host: Host,
  ): string {
    const cwd = input.cwd || host.workdir || "."
    const job = `os-${input.id}`
    const folder = `.openscience/jobs`
    const log = `${folder}/${input.id}.log`
    const enter = `cd ${quote(cwd)} && mkdir -p ${quote(folder)}`
    const run = workload(input)
    if (host.scheduler === "slurm") {
      return [
        enter,
        [
          "sbatch --wait --parsable",
          `--job-name=${quote(job)}`,
          `--output=${quote(log)}`,
          `--error=${quote(log)}`,
          ...slurm(input),
          `--wrap=${quote(run)}`,
        ].join(" "),
        "code=$?",
        `test -f ${quote(log)} && cat ${quote(log)}`,
        "exit $code",
      ].join("; ")
    }
    if (host.scheduler === "pbs") {
      const script = `#!/usr/bin/env bash\nset -o pipefail\n${run}\n`
      return [
        enter,
        [
          `printf %s ${quote(script)} | qsub -W block=true`,
          `-N ${quote(name(job))}`,
          "-j oe",
          `-o ${quote(log)}`,
          ...pbs(input),
        ].join(" "),
        "code=$?",
        `test -f ${quote(log)} && cat ${quote(log)}`,
        "exit $code",
      ].join("; ")
    }
    return `${enter} && exec bash -lc ${quote(run)}`
  }

  function ssh(host: Host, script: string): string[] {
    const destination = host.user ? `${host.user}@${host.host}` : host.host
    if (destination.startsWith("-")) throw new Error("SSH destinations cannot begin with a hyphen")
    const port = host.port ? ["-p", String(host.port)] : []
    return ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", ...port, "--", destination, script]
  }

  export function command(
    input: {
      id: string
      name: string
      command: string
      cwd?: string
      resources?: Resources
      modules?: string[]
      container?: string
    },
    host?: Host,
  ): { argv: string[]; scheduler: Scheduler; label: string } {
    if (!host) {
      return {
        argv: [Shell.acceptable(), "-lc", input.command],
        scheduler: "none",
        label: "This computer",
      }
    }
    return {
      argv: ssh(host, remote(input, host)),
      scheduler: host.scheduler,
      label: host.label,
    }
  }

  async function output(argv: string[], cwd: string): Promise<string | undefined> {
    const proc = Bun.spawn(argv, {
      cwd,
      env: await OpenScience.subprocessEnv(process.env),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
    })
    const [code, text] = await Promise.all([proc.exited, new Response(proc.stdout).text()])
    if (code !== 0) return
    return text.trim() || undefined
  }

  function inside(root: string, file: string): string | undefined {
    const target = path.resolve(root, file)
    const relative = path.relative(root, target)
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return
    return relative
  }

  async function fingerprint(root: string, file: string): Promise<Artifact | undefined> {
    const relative = inside(root, file)
    if (!relative) return
    const target = path.join(root, relative)
    const stat = await fs.stat(target).catch(() => undefined)
    if (!stat?.isFile()) return
    const hash = new Bun.CryptoHasher("sha256")
    for await (const chunk of createReadStream(target)) hash.update(chunk)
    return Artifact.parse({
      path: relative.split(path.sep).join("/"),
      size: stat.size,
      sha256: hash.digest("hex"),
      modified_at: stat.mtime.toISOString(),
    })
  }

  async function artifacts(root: string, patterns: string[]): Promise<Artifact[]> {
    const files = new Set<string>()
    for (const pattern of patterns) {
      if (!inside(root, pattern.replaceAll("*", "x"))) continue
      const glob = new Bun.Glob(pattern)
      for await (const file of glob.scan({ cwd: root, dot: true, onlyFiles: true })) {
        files.add(file)
        if (files.size >= 200) break
      }
      if (files.size >= 200) break
    }
    const values = await Promise.all([...files].toSorted().map((file) => fingerprint(root, file)))
    return values.filter((item): item is Artifact => !!item)
  }

  const lockfiles = [
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "uv.lock",
    "poetry.lock",
    "Pipfile.lock",
    "requirements.txt",
    "environment.yml",
    "environment.yaml",
    "renv.lock",
    "Manifest.toml",
    "Cargo.lock",
  ]

  async function reproduce(job: Job): Promise<Reproducibility> {
    const cwd = path.resolve(job.cwd ?? process.cwd())
    const [branch, commit, status, python, capturedLocks] = await Promise.all([
      output(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd),
      output(["git", "rev-parse", "HEAD"], cwd),
      output(["git", "status", "--porcelain"], cwd),
      output(["python3", "--version"], cwd),
      Promise.all(lockfiles.map((file) => fingerprint(cwd, file))),
    ])
    const git = branch || commit || status !== undefined ? { branch, commit, dirty: !!status } : undefined
    return Reproducibility.parse({
      captured_at: new Date().toISOString(),
      command: job.command,
      cwd,
      platform: process.platform,
      arch: process.arch,
      bun: Bun.version,
      node: process.version,
      python,
      git,
      lockfiles: capturedLocks.filter((item): item is Artifact => !!item),
      resources: job.resources,
    })
  }

  async function capture(job: Job): Promise<Pick<Job, "artifacts" | "checkpoint" | "reproducibility">> {
    const cwd = path.resolve(job.cwd ?? process.cwd())
    const [found, checkpoint, reproducibility] = await Promise.all([
      artifacts(cwd, job.artifact_patterns ?? []),
      job.checkpoint_path ? fingerprint(cwd, job.checkpoint_path) : undefined,
      reproduce(job),
    ])
    return {
      artifacts: found,
      checkpoint,
      reproducibility,
    }
  }

  export async function probe(host: Host): Promise<Probe> {
    const parsed = Host.parse(host)
    const started = performance.now()
    const script = [
      "printf 'connected=1\\n'",
      "printf 'hostname='; hostname 2>/dev/null || true",
      "command -v python3 >/dev/null 2>&1 && printf 'python=1\\n' || true",
      "command -v nvidia-smi >/dev/null 2>&1 && printf 'gpu=1\\n' || true",
      "command -v sbatch >/dev/null 2>&1 && printf 'slurm=1\\n' || true",
      "command -v qsub >/dev/null 2>&1 && printf 'pbs=1\\n' || true",
    ].join("; ")
    const argv = ssh(parsed, script)
    const proc = spawn(argv[0]!, argv.slice(1), {
      env: await OpenScience.subprocessEnv(process.env),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    proc.stdout?.on("data", (chunk: Buffer) => output.push(chunk))
    proc.stderr?.on("data", (chunk: Buffer) => errors.push(chunk))
    const done = new Promise<{ code: number | null; error?: string }>((resolve) => {
      proc.once("error", (error) => resolve({ code: null, error: error.message }))
      proc.once("exit", (code) => resolve({ code }))
    })
    const result = await Promise.race([
      done,
      Bun.sleep(12_000).then(() => ({ code: null, error: "Connection timed out" })),
    ])
    if (proc.exitCode === null) {
      await Shell.killTree(proc, {
        detached: false,
        exited: () => proc.exitCode !== null,
      })
    }
    const text = Buffer.concat(output).toString("utf8")
    const error = result.error || (result.code === 0 ? undefined : Buffer.concat(errors).toString("utf8").trim())
    return Probe.parse({
      ok: result.code === 0 && text.includes("connected=1"),
      host: parsed.label,
      latency_ms: Math.round(performance.now() - started),
      hostname: text.match(/^hostname=(.+)$/m)?.[1]?.trim(),
      python: text.includes("python=1"),
      gpu: text.includes("gpu=1"),
      slurm: text.includes("slurm=1"),
      pbs: text.includes("pbs=1"),
      error: error || undefined,
    })
  }

  async function execute(job: Job, host: Host | undefined, root: string): Promise<void> {
    await fs.mkdir(logsOf(root), { recursive: true })
    await fs.rm(exitOf(root, job.id), { force: true })
    const wrapped = host
      ? job.command
      : `(${job.command}\n); code=$?; printf %s "$code" > ${quote(exitOf(root, job.id))}; exit "$code"`
    const spec = command({ ...job, command: wrapped }, host)
    const log = path.join(logsOf(root), `${job.id}.log`)
    const output = await fs.open(log, "a", 0o600)
    const env = await OpenScience.subprocessEnv(process.env)
    const queued = await get(job.id, { root })
    if (queued?.status === "cancelled") {
      await output.close()
      return
    }
    const detached = process.platform !== "win32"
    const proc = spawn(spec.argv[0]!, spec.argv.slice(1), {
      cwd: host ? undefined : job.cwd,
      env,
      detached,
      windowsHide: true,
      stdio: ["ignore", output.fd, output.fd],
    })
    const result = new Promise<{ code: number | null; error?: string }>((resolve) => {
      proc.once("error", (error) => resolve({ code: null, error: error.message }))
      proc.once("exit", (code) => resolve({ code }))
    })
    await output.close()
    const current = await get(job.id, { root })
    if (current?.status === "cancelled") {
      await Shell.killTree(proc, {
        detached,
        exited: () => proc.exitCode !== null,
      })
      return
    }
    active.set(keyOf(root, job.id), { process: proc, detached, host })
    await patch(root, job.id, {
      status: "running",
      started_at: new Date().toISOString(),
      pid: proc.pid,
    })
    const completed = await result
    const final = await get(job.id, { root })
    if (final?.status === "cancelled") {
      active.delete(keyOf(root, job.id))
      return
    }
    const captureResult = host
      ? undefined
      : await capture(job)
          .then((value) => ({ ...value, capture_error: undefined }))
          .catch((error) => ({
            capture_error: error instanceof Error ? error.message : String(error),
          }))
    await patch(root, job.id, {
      status: completed.code === 0 ? "succeeded" : "failed",
      completed_at: new Date().toISOString(),
      exit_code: completed.code,
      error: completed.error,
      ...captureResult,
    }).finally(() => active.delete(keyOf(root, job.id)))
  }

  export async function start(input: Input, options: Options = {}): Promise<Job> {
    const parsed = Input.parse(input)
    const root = rootOf(options.root)
    const hostId = parsed.target.kind === "ssh" ? parsed.target.host_id : undefined
    const host = hostId ? options.hosts?.find((item) => item.id === hostId) : undefined
    if (parsed.target.kind === "ssh" && !host) throw new Error("The selected SSH compute profile was not found")
    const id = crypto.randomUUID().slice(0, 12)
    const spec = command({ id, ...parsed }, host)
    const job = Job.parse({
      id,
      name: parsed.name,
      command: parsed.command,
      cwd: parsed.cwd || host?.workdir,
      target: parsed.target,
      target_label: spec.label,
      scheduler: spec.scheduler,
      status: "queued",
      created_at: new Date().toISOString(),
      resources: parsed.resources,
      modules: parsed.modules,
      container: parsed.container,
      artifact_patterns: parsed.artifacts,
      checkpoint_path: parsed.checkpoint,
    })
    await change(root, (jobs) => {
      jobs.push(job)
    })
    void execute(job, host, root).catch(async (error) => {
      await fs.mkdir(logsOf(root), { recursive: true })
      await fs
        .appendFile(
          path.join(logsOf(root), `${job.id}.log`),
          `${error instanceof Error ? error.message : String(error)}\n`,
        )
        .catch(() => {})
      await patch(root, job.id, {
        status: "failed",
        completed_at: new Date().toISOString(),
        exit_code: null,
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => {})
    })
    return job
  }

  export async function list(options: Options = {}): Promise<Job[]> {
    const root = rootOf(options.root)
    await sync(root)
    return (await read(root)).toSorted(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at) || b.id.localeCompare(a.id),
    )
  }

  export async function get(id: string, options: Options = {}): Promise<Job | undefined> {
    return (await read(rootOf(options.root))).find((job) => job.id === id)
  }

  export async function log(id: string, options: Options & { bytes?: number } = {}): Promise<string> {
    const job = await get(id, options)
    if (!job) throw new Error(`Compute job ${id} was not found`)
    const text = await Bun.file(path.join(logsOf(rootOf(options.root)), `${job.id}.log`))
      .text()
      .catch(() => "")
    return text.slice(-Math.max(1, options.bytes ?? 256_000))
  }

  export async function cancel(id: string, options: Options = {}): Promise<Job> {
    const root = rootOf(options.root)
    const job = await get(id, { root })
    if (!job) throw new Error(`Compute job ${id} was not found`)
    if (terminal.has(job.status)) return job
    const cancelled = await patch(root, id, {
      status: "cancelled",
      completed_at: new Date().toISOString(),
      exit_code: null,
    })
    const runtime = active.get(keyOf(root, id))
    if (runtime) {
      await Shell.killTree(runtime.process, {
        detached: runtime.detached,
        exited: () => runtime.process.exitCode !== null,
      })
      active.delete(keyOf(root, id))
    } else if (job.pid) {
      try {
        if (process.platform === "win32") process.kill(job.pid, "SIGTERM")
        else process.kill(-job.pid, "SIGTERM")
      } catch {}
    }
    const hostId = job.target.kind === "ssh" ? job.target.host_id : undefined
    const host = hostId ? options.hosts?.find((item) => item.id === hostId) : undefined
    if (host && host.scheduler !== "none") {
      const action =
        host.scheduler === "slurm"
          ? `scancel --name ${quote(`os-${job.id}`)}`
          : `qselect -N ${quote(name(`os-${job.id}`))} | xargs -r qdel`
      const spec = command(
        { id: job.id, name: job.name, command: action, cwd: host.workdir },
        { ...host, scheduler: "none" },
      )
      const proc = spawn(spec.argv[0]!, spec.argv.slice(1), {
        env: await OpenScience.subprocessEnv(process.env),
        windowsHide: true,
        stdio: "ignore",
      })
      await new Promise<void>((resolve) => {
        proc.once("error", () => resolve())
        proc.once("exit", () => resolve())
      })
    }
    return cancelled
  }

  export async function clear(options: Options = {}): Promise<number> {
    const root = rootOf(options.root)
    const removed = await change(root, (jobs) => {
      const done = jobs.filter((job) => terminal.has(job.status)).map((job) => job.id)
      const keep = jobs.filter((job) => !terminal.has(job.status))
      jobs.splice(0, jobs.length, ...keep)
      return done
    })
    await Promise.all(
      removed.flatMap((id) => [
        fs.rm(path.join(logsOf(root), `${id}.log`), { force: true }),
        fs.rm(exitOf(root, id), { force: true }),
      ]),
    )
    return removed.length
  }

  export async function wait(id: string, options: Options & { timeout?: number } = {}): Promise<Job> {
    const started = Date.now()
    const timeout = options.timeout ?? 30_000
    for (;;) {
      const job = (await list(options)).find((item) => item.id === id)
      if (!job) throw new Error(`Compute job ${id} was not found`)
      if (terminal.has(job.status)) return job
      if (Date.now() - started >= timeout) throw new Error(`Timed out waiting for compute job ${id}`)
      await Bun.sleep(25)
    }
  }
}
