import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { ComputeJobs } from "../../src/compute/jobs"
import { tmpdir } from "../fixture/fixture"

describe("ComputeJobs command adapters", () => {
  const host = {
    id: "cluster",
    label: "Lab cluster",
    host: "hpc.example.org",
    user: "researcher",
    port: 2222,
    scheduler: "slurm" as const,
    workdir: "/scratch/team project",
  }

  test("builds a non-interactive SSH command for a Slurm job", () => {
    const command = ComputeJobs.command(
      {
        id: "job-123",
        name: "RNA benchmark",
        command: "python train.py --label 'A B'",
        cwd: "/scratch/team project",
        resources: {
          cpus: 8,
          gpus: 2,
          memory_gb: 48,
          time_minutes: 95,
          partition: "gpu-long",
        },
        modules: ["cuda/12.4", "python/3.12"],
        container: "/containers/research image.sif",
      },
      host,
    )

    expect(command.argv.slice(0, 7)).toEqual(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-p", "2222"])
    expect(command.argv).toContain("researcher@hpc.example.org")
    expect(command.argv.at(-1)).toContain("sbatch --wait --parsable")
    expect(command.argv.at(-1)).toContain("--cpus-per-task=8")
    expect(command.argv.at(-1)).toContain("--gres=gpu:2")
    expect(command.argv.at(-1)).toContain("--mem=48G")
    expect(command.argv.at(-1)).toContain("--time=01:35:00")
    expect(command.argv.at(-1)).toContain("--partition='gpu-long'")
    expect(command.argv.at(-1)).toContain("module load")
    expect(command.argv.at(-1)).toContain("cuda/12.4")
    expect(command.argv.at(-1)).toContain("python/3.12")
    expect(command.argv.at(-1)).toContain("apptainer exec")
    expect(command.argv.at(-1)).toContain("/containers/research image.sif")
    expect(command.argv.at(-1)).toContain("os-job-123")
    expect(command.argv.at(-1)).toContain("python train.py")
  })

  test("builds PBS and direct SSH adapters from the same profile", () => {
    const input = {
      id: "job-9",
      name: "Variant call",
      command: "bash pipeline.sh",
      cwd: "/work",
      resources: { cpus: 4, gpus: 1, memory_gb: 16, time_minutes: 30 },
    }
    const pbs = ComputeJobs.command(input, { ...host, scheduler: "pbs" }).argv.at(-1)
    expect(pbs).toContain("qsub")
    expect(pbs).toContain("select=1:ncpus=4:ngpus=1:mem=16gb")
    expect(pbs).toContain("walltime=00:30:00")
    expect(ComputeJobs.command(input, { ...host, scheduler: "none" }).argv.at(-1)).toContain("exec")
  })
})

describe("ComputeJobs local lifecycle", () => {
  test("a missing working directory fails durably without crashing the server process", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "state")
    const cwd = path.join(tmp.path, "missing")
    const cli = path.join(import.meta.dir, "../..")
    const script = `
      import { ComputeJobs } from "./src/compute/jobs"
      const job = await ComputeJobs.start(
        {
          name: "missing cwd",
          command: "printf unreachable",
          cwd: ${JSON.stringify(cwd)},
          target: { kind: "local" },
        },
        { root: ${JSON.stringify(root)} },
      )
      const result = await ComputeJobs.wait(job.id, { root: ${JSON.stringify(root)}, timeout: 5_000 })
      console.log(JSON.stringify(result))
    `
    const proc = Bun.spawn([process.execPath, "-e", script], {
      cwd: cli,
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])

    expect(code, stderr).toBe(0)
    const job = ComputeJobs.Job.parse(JSON.parse(stdout.trim()))
    expect(job.status).toBe("failed")
    expect(job.exit_code).toBeNull()
    expect(job.error).toMatch(/ENOENT|no such file or directory/i)
  })

  test("runs a real local job, persists status, and streams its log", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "state")
    const job = await ComputeJobs.start(
      {
        name: "deterministic smoke",
        command: "printf 'alpha\\nbeta\\n'",
        cwd: tmp.path,
        target: { kind: "local" },
      },
      { root },
    )

    const finished = await ComputeJobs.wait(job.id, { root, timeout: 5_000 })
    expect(finished.status).toBe("succeeded")
    expect(finished.exit_code).toBe(0)
    expect(await ComputeJobs.log(job.id, { root })).toContain("alpha\nbeta")
    expect(finished.reproducibility).toMatchObject({
      platform: process.platform,
      arch: process.arch,
      command: "printf 'alpha\\nbeta\\n'",
    })
  })

  test("captures output artifacts, checksums, lockfiles, and checkpoints", async () => {
    await using tmp = await tmpdir({ git: true })
    const root = path.join(tmp.path, "state")
    await Bun.write(path.join(tmp.path, "requirements.txt"), "numpy==2.2.0\n")
    const job = await ComputeJobs.start(
      {
        name: "artifact capture",
        command:
          "mkdir -p outputs checkpoints && printf 'metric,value\\nloss,0.1\\n' > outputs/results.csv && printf model > checkpoints/latest.ckpt",
        cwd: tmp.path,
        target: { kind: "local" },
        artifacts: ["outputs/**/*.csv"],
        checkpoint: "checkpoints/latest.ckpt",
        resources: { cpus: 2, memory_gb: 4 },
      },
      { root },
    )

    const finished = await ComputeJobs.wait(job.id, { root, timeout: 5_000 })
    expect(finished.artifacts).toHaveLength(1)
    expect(finished.artifacts?.[0]).toMatchObject({
      path: "outputs/results.csv",
      size: 22,
    })
    expect(finished.artifacts?.[0]?.sha256).toMatch(/^[a-f0-9]{64}$/)
    expect(finished.checkpoint).toMatchObject({
      path: "checkpoints/latest.ckpt",
      size: 5,
    })
    expect(finished.reproducibility?.git?.dirty).toBe(true)
    expect(finished.reproducibility?.lockfiles).toContainEqual(
      expect.objectContaining({
        path: "requirements.txt",
        sha256: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    )
  })

  test("cancels a running local process tree", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "state")
    const job = await ComputeJobs.start(
      {
        name: "cancel smoke",
        command: "sleep 30",
        cwd: tmp.path,
        target: { kind: "local" },
      },
      { root },
    )

    await ComputeJobs.cancel(job.id, { root })
    const cancelled = await ComputeJobs.wait(job.id, { root, timeout: 5_000 })
    expect(cancelled.status).toBe("cancelled")
  })

  test("recovers a completed detached job from its durable exit marker", async () => {
    const root = await fs.mkdtemp(path.join(import.meta.dir, "jobs-recovery-"))
    const id = "recovered-job"
    await fs.mkdir(path.join(root, "jobs"), { recursive: true })
    await Bun.write(
      path.join(root, "jobs.json"),
      JSON.stringify([
        {
          id,
          name: "recovered",
          command: "true",
          target: { kind: "local" },
          target_label: "This computer",
          scheduler: "none",
          status: "running",
          created_at: new Date(Date.now() - 10_000).toISOString(),
          started_at: new Date(Date.now() - 9_000).toISOString(),
          pid: 999_999,
        },
      ]),
    )
    await Bun.write(path.join(root, "jobs", `${id}.exit`), "0")

    const job = (await ComputeJobs.list({ root })).find((item) => item.id === id)
    expect(job?.status).toBe("succeeded")
    expect(job?.exit_code).toBe(0)
    await fs.rm(root, { recursive: true, force: true })
  })
})
