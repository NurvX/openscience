import { describe, expect, test } from "bun:test"
import { createArtifactContext } from "./context"
import { inspectorTabs, normalizeInspectorData } from "./inspector"

const context = createArtifactContext({
  directory: "/work/project",
  path: "results/protein.pdb",
  format: "pdb",
  scienceKind: "protein-structure",
})

describe("artifact inspector model", () => {
  test("normalizes recorded source, environment, and Git provenance", () => {
    const result = normalizeInspectorData(context, {
      file: { type: "text", content: "ATOM      1", size: 12 },
      provenance: {
        path: "results/protein.pdb",
        tracked: true,
        dirty: false,
        status: "clean",
        branch: "openscience/aayam-new",
        commit: {
          sha: "0123456789abcdef",
          author: "Aayam Bansal",
          email: "aayambansal@gmail.com",
          date: "2026-07-29T00:00:00.000Z",
          message: "record structure",
        },
      },
      audit: {
        environments: ["pyproject.toml", "environment.yml"],
        lockfiles: ["uv.lock"],
      },
    })

    expect(result.source).toBe("ATOM      1")
    expect(result.provenance).toMatchObject({
      status: "clean",
      branch: "openscience/aayam-new",
      commit: { sha: "0123456789abcdef", author: "Aayam Bansal" },
    })
    expect(result.environments).toEqual(["pyproject.toml", "environment.yml"])
    expect(result.lockfiles).toEqual(["uv.lock"])
    expect(result.tabs.code.available).toBe(true)
    expect(result.tabs.environment.available).toBe(true)
    expect(result.tabs.history.available).toBe(true)
    expect(result.tabs.run.available).toBe(false)
    expect(result.tabs.messages.available).toBe(false)
    expect(result.tabs.review.available).toBe(true)
  })

  test("keeps malformed and absent records honest instead of inventing metadata", () => {
    const result = normalizeInspectorData(context, {
      file: { type: "text", content: 12, encoding: "base64" },
      provenance: { tracked: "yes", commit: { sha: 12 } },
      audit: { environments: ["pyproject.toml", 4], lockfiles: "uv.lock" },
    })

    expect(result.source).toBeUndefined()
    expect(result.provenance).toBeUndefined()
    expect(result.environments).toEqual([])
    expect(result.lockfiles).toEqual([])
    expect(result.tabs.code).toEqual({
      available: false,
      title: "Source is not directly displayable",
      detail: "Open the file view or download the original artifact.",
    })
    expect(result.tabs.history).toMatchObject({ available: false, title: "No Git commit is recorded" })
  })

  test("publishes the complete stable inspector tab order", () => {
    expect(inspectorTabs).toEqual(["details", "code", "run", "messages", "environment", "review", "history"])
  })
})
