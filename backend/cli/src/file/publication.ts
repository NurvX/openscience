import fs from "node:fs/promises"
import path from "node:path"
import z from "zod"
import { OpenScience } from "../openscience"

export namespace PublicationFile {
  export const Format = z.enum(["html", "pdf", "docx", "latex", "pptx"])
  export type Format = z.infer<typeof Format>

  export const Input = z.object({
    path: z.string().trim().min(1).max(4_000),
    format: Format,
  })
  export type Input = z.infer<typeof Input>

  export const Capabilities = z.object({
    pandoc: z.boolean(),
    pdf_engine: z.string().optional(),
    formats: z.record(Format, z.boolean()),
  })
  export type Capabilities = z.infer<typeof Capabilities>

  export const Result = z.object({
    path: z.string(),
    format: Format,
    size: z.number().int().nonnegative(),
    created_at: z.string(),
    engine: z.string(),
  })
  export type Result = z.infer<typeof Result>

  const extensions: Record<Format, string> = {
    html: "html",
    pdf: "pdf",
    docx: "docx",
    latex: "tex",
    pptx: "pptx",
  }

  export async function capabilities(): Promise<Capabilities> {
    const pandoc = Boolean(Bun.which("pandoc"))
    const pdf = Bun.which("xelatex") ?? Bun.which("pdflatex") ?? Bun.which("typst") ?? undefined
    return Capabilities.parse({
      pandoc,
      pdf_engine: pdf ? path.basename(pdf) : undefined,
      formats: {
        html: pandoc,
        pdf: pandoc && Boolean(pdf),
        docx: pandoc,
        latex: pandoc,
        pptx: pandoc,
      },
    })
  }

  export async function render(root: string, input: Input): Promise<Result> {
    const parsed = Input.parse(input)
    const source = resolve(root, parsed.path)
    if (![".md", ".markdown"].includes(path.extname(source).toLowerCase())) {
      throw new Error("Publication export currently requires a Markdown report")
    }
    if (!(await Bun.file(source).exists())) throw new Error(`Report not found: ${parsed.path}`)
    const support = await capabilities()
    if (!support.formats[parsed.format]) {
      throw new Error(
        parsed.format === "pdf"
          ? "PDF export requires Pandoc and a local TeX or Typst engine"
          : `${parsed.format.toUpperCase()} export requires Pandoc`,
      )
    }
    const folder = path.join(root, "exports")
    await fs.mkdir(folder, { recursive: true })
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 17)
    const nonce = crypto.randomUUID().slice(0, 8)
    const stem =
      path
        .basename(source, path.extname(source))
        .toLowerCase()
        .replace(/[^a-z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "") || "report"
    const relative = path.join(
      "exports",
      `${stem}-${stamp.slice(0, 8)}-${stamp.slice(8)}-${nonce}.${extensions[parsed.format]}`,
    )
    const target = path.join(root, relative)
    const args = [
      "pandoc",
      source,
      "--standalone",
      `--resource-path=${path.dirname(source)}${path.delimiter}${root}`,
      "--output",
      target,
      ...(parsed.format === "pdf" && support.pdf_engine ? [`--pdf-engine=${support.pdf_engine}`] : []),
    ]
    const proc = Bun.spawn(args, {
      cwd: root,
      env: await OpenScience.subprocessEnv(process.env),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    })
    const [code, stdout, stderr] = await Promise.all([
      proc.exited,
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ])
    if (code !== 0) {
      await fs.rm(target, { force: true })
      throw new Error(stderr.trim() || stdout.trim() || `Pandoc exited with code ${code}`)
    }
    const stat = await fs.stat(target)
    return Result.parse({
      path: relative.split(path.sep).join("/"),
      format: parsed.format,
      size: stat.size,
      created_at: new Date().toISOString(),
      engine: parsed.format === "pdf" ? `pandoc + ${support.pdf_engine}` : "pandoc",
    })
  }

  function resolve(root: string, file: string): string {
    const target = path.resolve(root, file)
    const relative = path.relative(root, target)
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error("Publication path escapes the project directory")
    }
    return target
  }
}
