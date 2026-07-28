import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { detectBinaryScienceFormat, formatBytes, normalizeInspection } from "./binary"

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), "utf8")

describe("binary scientific format helpers", () => {
  test.each([
    ["bam", "bam"],
    ["CRAM", "cram"],
    ["h5ad", "h5ad"],
    ["loom", "loom"],
  ])("detects %s", (extension, format) => {
    expect(detectBinaryScienceFormat(extension)).toBe(format as ReturnType<typeof detectBinaryScienceFormat>)
  })

  test("does not claim generic binaries", () => {
    expect(detectBinaryScienceFormat("bin")).toBeUndefined()
  })

  test("formats scientific file sizes compactly", () => {
    expect(formatBytes(1024)).toBe("1 KB")
    expect(formatBytes(2.5 * 1024 * 1024)).toBe("2.5 MB")
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe("3 GB")
  })

  test("normalizes malformed API data into a safe inspection", () => {
    expect(
      normalizeInspection({ format: "bam", size: 12, tool: { name: "samtools", available: false } }),
    ).toMatchObject({
      format: "bam",
      size: 12,
      signature: false,
      details: {},
      tool: { name: "samtools", available: false },
    })
  })
})

describe("binary scientific workbench integration", () => {
  test("routes supported containers through local inspection and raw downloads", () => {
    const preview = read("../../atlas/FilePreview.tsx")
    const view = read("./BinaryScienceView.tsx")

    expect(preview).toContain('import { BinaryScienceView } from "@/science/formats/BinaryScienceView"')
    expect(preview).toContain('return "scientific-binary"')
    expect(preview).toContain("/file/raw?")
    expect(view).toContain("/file/inspect?")
    expect(view).toContain("Dataset inventory")
    expect(view).toContain("Reference coverage")
  })
})
