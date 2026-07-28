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
      },
      host,
    )

    expect(command.argv.slice(0, 7)).toEqual(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-p", "2222"])
    expect(command.argv).toContain("researcher@hpc.example.org")
    expect(command.argv.at(-1)).toContain("sbatch --wait --parsable")
    expect(command.argv.at(-1)).toContain("os-job-123")
    expect(command.argv.at(-1)).toContain("python train.py")
  })

  test("builds PBS and direct SSH adapters from the same profile", () => {
    const input = { id: "job-9", name: "Variant call", command: "bash pipeline.sh", cwd: "/work" }
    expect(ComputeJobs.command(input, { ...host, scheduler: "pbs" }).argv.at(-1)).toContain("qsub")
    expect(ComputeJobs.command(input, { ...host, scheduler: "none" }).argv.at(-1)).toContain("exec")
  })
})

describe("ComputeJobs local lifecycle", () => {
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
