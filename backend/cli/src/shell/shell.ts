import { Flag } from "@/flag/flag"
import { lazy } from "@/util/lazy"
import path from "path"
import fs from "fs"
import { spawn, spawnSync, type ChildProcess } from "child_process"

const SIGKILL_TIMEOUT_MS = 200

export namespace Shell {
  /** Only use a negative-pid signal when the child leads its own process group. */
  function leadsOwnGroup(pid: number): boolean {
    if (process.platform !== "linux") return true
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8")
      // Fields after the closing ")" are: state, ppid, pgrp, session, ...
      const fields = stat.slice(stat.lastIndexOf(")") + 2).split(" ")
      return Number(fields[2]) === pid
    } catch {
      return false
    }
  }

  export async function killTree(proc: ChildProcess, opts?: { exited?: () => boolean }): Promise<void> {
    const pid = proc.pid
    if (!pid || opts?.exited?.()) return

    if (process.platform === "win32") {
      await new Promise<void>((resolve) => {
        const killer = spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" })
        killer.once("exit", () => resolve())
        killer.once("error", () => resolve())
      })
      return
    }

    if (leadsOwnGroup(pid)) {
      try {
        process.kill(-pid, "SIGTERM")
        await Bun.sleep(SIGKILL_TIMEOUT_MS)
        if (!opts?.exited?.()) process.kill(-pid, "SIGKILL")
        return
      } catch {
        // The group is gone or unavailable. Fall back to the direct child.
      }
    }

    try {
      proc.kill("SIGTERM")
      await Bun.sleep(SIGKILL_TIMEOUT_MS)
      if (!opts?.exited?.()) proc.kill("SIGKILL")
    } catch {}
  }

  /**
   * Best-effort synchronous process-tree cleanup for process exit handlers.
   * Exit handlers cannot wait for killTree's timer or an asynchronous taskkill.
   */
  export function killTreeSync(proc: ChildProcess): void {
    const pid = proc.pid
    if (!pid) return

    if (process.platform === "win32") {
      try {
        spawnSync("taskkill", ["/pid", String(pid), "/f", "/t"], {
          stdio: "ignore",
          windowsHide: true,
          timeout: 5_000,
        })
      } catch {}
      return
    }

    if (leadsOwnGroup(pid)) {
      try {
        process.kill(-pid, "SIGKILL")
        return
      } catch {}
    }

    try {
      proc.kill("SIGKILL")
    } catch {}
  }
  const BLACKLIST = new Set(["fish", "nu"])

  function exists(p: string) {
    try {
      return fs.existsSync(p)
    } catch {
      return false
    }
  }

  function fallback() {
    if (process.platform === "win32") {
      if (Flag.OPENSCIENCE_GIT_BASH_PATH) return Flag.OPENSCIENCE_GIT_BASH_PATH
      const git = Bun.which("git")
      if (git) {
        // git.exe is typically at: C:\Program Files\Git\cmd\git.exe
        // bash.exe is at: C:\Program Files\Git\bin\bash.exe
        const bash = path.join(git, "..", "..", "bin", "bash.exe")
        if (Bun.file(bash).size) return bash
      }
      return process.env.COMSPEC || "cmd.exe"
    }
    if (process.platform === "darwin") {
      if (exists("/bin/zsh")) return "/bin/zsh"
    }
    const bash = Bun.which("bash")
    if (bash) return bash
    if (exists("/bin/bash")) return "/bin/bash"
    return "/bin/sh"
  }

  export const preferred = lazy(() => {
    const s = process.env.SHELL
    if (s) return s
    return fallback()
  })

  export const acceptable = lazy(() => {
    const s = process.env.SHELL
    if (s && !BLACKLIST.has(process.platform === "win32" ? path.win32.basename(s) : path.basename(s))) return s
    return fallback()
  })
}
