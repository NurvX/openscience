import { describe, expect, test } from "bun:test"
import path from "node:path"
import { PublicationFile } from "../../src/file/publication"
import { tmpdir } from "../fixture/fixture"

describe("PublicationFile", () => {
  test("detects real local publication export capabilities", async () => {
    const capabilities = await PublicationFile.capabilities()
    expect(capabilities.formats.html).toBe(true)
    expect(capabilities.formats.docx).toBe(capabilities.pandoc)
    expect(capabilities.formats.pptx).toBe(capabilities.pandoc)
    expect(capabilities.formats.pdf).toBe(capabilities.pandoc && Boolean(capabilities.pdf_engine))
  })

  test("exports a secure standalone HTML publication without external tooling", async () => {
    await using tmp = await tmpdir({
      init: async (directory) => {
        await Bun.write(
          path.join(directory, "report.md"),
          "# Treatment response\n\nThe observed response was **42%**.\n\n<script>alert('unsafe')</script>\n",
        )
      },
    })
    const result = await PublicationFile.render(tmp.path, { path: "report.md", format: "html" })
    expect(result.path).toMatch(/^exports\/report-\d{8}-\d{9}-[a-f0-9]{8}\.html$/)
    expect(result.size).toBeGreaterThan(100)
    expect(result.engine).toBe("OpenScience Markdown")
    const html = await Bun.file(path.join(tmp.path, result.path)).text()
    expect(html).toContain("Treatment response")
    expect(html).toContain("Content-Security-Policy")
    expect(html).not.toContain("<script>alert")
  })

  test("never overwrites a rapid repeated export", async () => {
    await using tmp = await tmpdir({
      init: async (directory) => {
        await Bun.write(path.join(directory, "report.md"), "# Stable export\n")
      },
    })

    const [first, second] = await Promise.all([
      PublicationFile.render(tmp.path, { path: "report.md", format: "html" }),
      PublicationFile.render(tmp.path, { path: "report.md", format: "html" }),
    ])
    expect(first.path).not.toBe(second.path)
    expect(await Bun.file(path.join(tmp.path, first.path)).exists()).toBe(true)
    expect(await Bun.file(path.join(tmp.path, second.path)).exists()).toBe(true)
  })

  test("rejects non-report inputs and project traversal", async () => {
    await using tmp = await tmpdir({
      init: async (directory) => {
        await Bun.write(path.join(directory, "data.csv"), "a,b\n1,2\n")
      },
    })
    await expect(PublicationFile.render(tmp.path, { path: "data.csv", format: "html" })).rejects.toThrow("Markdown")
    await expect(PublicationFile.render(tmp.path, { path: "../report.md", format: "html" })).rejects.toThrow("escapes")
  })
})
