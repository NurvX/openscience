import { $ } from "bun"
import fs from "node:fs"
import path from "node:path"
import z from "zod"

export namespace ArtifactFile {
  export const Kind = z.enum([
    "notebook",
    "dataset",
    "figure",
    "report",
    "structure",
    "sequence",
    "genomics",
    "spectrum",
    "model",
    "archive",
  ])
  export type Kind = z.infer<typeof Kind>

  export const Info = z.object({
    name: z.string(),
    path: z.string(),
    kind: Kind,
    format: z.string(),
    size: z.number(),
    modified: z.number(),
  })
  export type Info = z.infer<typeof Info>

  export const Provenance = z.object({
    path: z.string(),
    tracked: z.boolean(),
    dirty: z.boolean(),
    status: z.enum(["clean", "modified", "added", "deleted", "untracked", "local"]),
    branch: z.string().optional(),
    commit: z
      .object({
        sha: z.string(),
        author: z.string(),
        email: z.string(),
        date: z.string(),
        message: z.string(),
      })
      .optional(),
  })
  export type Provenance = z.infer<typeof Provenance>

  const kinds: Record<Kind, string[]> = {
    notebook: ["ipynb"],
    dataset: ["csv", "tsv", "jsonl", "parquet", "feather", "arrow", "xls", "xlsx", "h5", "hdf5", "h5ad", "loom"],
    figure: ["png", "jpg", "jpeg", "svg", "webp", "tif", "tiff", "gif"],
    report: ["pdf", "html", "htm", "md", "markdown", "docx", "tex", "latex"],
    structure: ["pdb", "ent", "cif", "mmcif", "pdbqt", "gro", "xyz", "sdf", "mol", "mol2", "smi", "smiles"],
    sequence: ["fa", "fasta", "faa", "fna", "ffn", "frn", "fastq", "fq"],
    genomics: ["vcf", "bcf", "bam", "cram", "bed", "bedgraph", "gff", "gff3", "gtf", "bigwig", "bw"],
    spectrum: ["mzml", "mzxml", "mgf", "cdf"],
    model: ["pkl", "pickle", "joblib", "pt", "pth", "ckpt", "safetensors", "onnx", "pb"],
    archive: ["zip", "tar", "gz", "bz2", "xz", "7z"],
  }
  const extensions = Object.fromEntries(
    Object.entries(kinds).flatMap(([kind, values]) => values.map((value) => [value, kind])),
  ) as Record<string, Kind>
  const excluded = new Set([
    ".git",
    ".hg",
    ".svn",
    ".cache",
    ".next",
    ".turbo",
    ".venv",
    "node_modules",
    "dist",
    "build",
    "target",
    "vendor",
    "__pycache__",
  ])
  const LIMIT = 5_000
  const DEPTH = 16

  export function classify(file: string): { kind: Kind; format: string } | undefined {
    const format = path.extname(file).slice(1).toLowerCase()
    const kind = extensions[format]
    if (!kind) return
    return { kind, format }
  }

  export async function scan(root: string): Promise<Info[]> {
    const artifacts: Info[] = []
    const walk = async (directory: string, relative: string, depth: number): Promise<void> => {
      if (depth > DEPTH || artifacts.length >= LIMIT) return
      const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => [] as fs.Dirent[])
      for (const entry of entries) {
        if (artifacts.length >= LIMIT) return
        if (entry.isDirectory()) {
          if (excluded.has(entry.name) || entry.name.startsWith(".")) continue
          await walk(path.join(directory, entry.name), path.join(relative, entry.name), depth + 1)
          continue
        }
        if (!entry.isFile()) continue
        const classified = classify(entry.name)
        if (!classified) continue
        const full = path.join(directory, entry.name)
        const stat = await fs.promises.stat(full).catch(() => undefined)
        if (!stat) continue
        artifacts.push({
          name: entry.name,
          path: path.join(relative, entry.name).replaceAll(path.sep, "/").replace(/^\.\//, ""),
          kind: classified.kind,
          format: classified.format,
          size: stat.size,
          modified: stat.mtimeMs,
        })
      }
    }
    await walk(root, ".", 0)
    return artifacts.toSorted((a, b) => b.modified - a.modified || a.path.localeCompare(b.path))
  }

  export async function provenance(root: string, file: string): Promise<Provenance> {
    const inside = await $`git rev-parse --is-inside-work-tree`.cwd(root).quiet().nothrow()
    if (inside.exitCode !== 0) {
      return { path: file, tracked: false, dirty: false, status: "local" }
    }
    const [branchResult, trackedResult, statusResult, logResult] = await Promise.all([
      $`git branch --show-current`.cwd(root).quiet().nothrow().text(),
      $`git ls-files --error-unmatch -- ${file}`.cwd(root).quiet().nothrow(),
      $`git status --porcelain=v1 -- ${file}`.cwd(root).quiet().nothrow().text(),
      $`git log -1 --format=%H%x00%an%x00%ae%x00%aI%x00%s -- ${file}`.cwd(root).quiet().nothrow().text(),
    ])
    const tracked = trackedResult.exitCode === 0
    const code = statusResult.trim().slice(0, 2)
    const status = statusOf(code, tracked)
    const parts = logResult.trim().split("\0")
    const commit =
      parts.length >= 5
        ? {
            sha: parts[0]!,
            author: parts[1]!,
            email: parts[2]!,
            date: parts[3]!,
            message: parts.slice(4).join("\0"),
          }
        : undefined
    return {
      path: file,
      tracked,
      dirty: status !== "clean",
      status,
      branch: branchResult.trim() || undefined,
      commit,
    }
  }

  function statusOf(code: string, tracked: boolean): Provenance["status"] {
    if (code === "??") return "untracked"
    if (code.includes("D")) return "deleted"
    if (code.includes("A")) return "added"
    if (code) return "modified"
    return tracked ? "clean" : "local"
  }
}
