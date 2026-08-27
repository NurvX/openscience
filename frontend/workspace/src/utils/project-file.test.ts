import { describe, expect, test } from "bun:test"
import { projectContains, projectFileQuery, rawFileQuery, resolveUniqueProjectFileReference } from "./project-file"

describe("project file requests", () => {
  test("builds collection and manuscript queries with the active session authority", () => {
    expect(
      projectFileQuery({
        directory: "/work/CERBench",
        sessionID: "ses_research",
      }),
    ).toEqual({ sessionID: "ses_research" })
    expect(
      projectFileQuery({
        directory: "/work/CERBench",
        path: "paper/report.md",
        sessionID: "ses_research",
      }),
    ).toEqual({ path: "/work/CERBench/paper/report.md", sessionID: "ses_research" })
  })

  test("anchors project-relative raw paths before adding session authorization", () => {
    expect(
      rawFileQuery({
        directory: "/work/CERBench",
        path: "figures/results.png",
        sessionID: "ses_research",
        inline: true,
      }),
    ).toEqual({
      path: "/work/CERBench/figures/results.png",
      sessionID: "ses_research",
      inline: "true",
    })
  })

  test("keeps session-workspace paths relative to the active session grant", () => {
    expect(
      rawFileQuery({
        directory: "/work/CERBench",
        path: "analysis/results.csv",
        sessionID: "ses_research",
        scope: "session",
        inline: true,
      }),
    ).toEqual({
      path: "analysis/results.csv",
      sessionID: "ses_research",
      inline: "true",
    })
  })

  test("preserves absolute granted paths and forwards an explicit byte cap", () => {
    expect(
      rawFileQuery({
        directory: "/work/CERBench",
        path: "/external/paper.pdf",
        sessionID: "ses_research",
        maxBytes: 64 * 1024 * 1024,
        inline: false,
      }),
    ).toEqual({
      path: "/external/paper.pdf",
      sessionID: "ses_research",
      maxBytes: 64 * 1024 * 1024,
      inline: "false",
    })
  })

  test("distinguishes project artifacts from other connected roots on POSIX and Windows", () => {
    expect(projectContains("/work/CERBench", "figures/result.png")).toBe(true)
    expect(projectContains("/work/CERBench", "figures/../result.png")).toBe(true)
    expect(projectContains("/work/CERBench", "../external/result.png")).toBe(false)
    expect(projectContains("/work/CERBench", "/work/CERBench-paper/result.png")).toBe(false)
    expect(projectContains("/work/CERBench", "/other/figures/result.png")).toBe(false)
    expect(projectContains("C:\\work\\CERBench", "figures\\result.png")).toBe(true)
    expect(projectContains("C:\\work\\CERBench", "..\\external\\result.png")).toBe(false)
    expect(projectContains("C:\\work\\CERBench", "D:\\figures\\result.png")).toBe(false)
  })

  test("recovers one unambiguous nested project file from a bare chat reference", () => {
    expect(
      resolveUniqueProjectFileReference("functional_annotations_top10.csv", [
        "tara_mag_nutrient_analysis/report.md",
        "tara_mag_nutrient_analysis/functional_annotations_top10.csv",
      ]),
    ).toBe("tara_mag_nutrient_analysis/functional_annotations_top10.csv")
  })

  test("does not guess explicit, ambiguous, truncated, or external file references", () => {
    const duplicates = ["run-a/results.csv", "run-b/results.csv"]
    expect(resolveUniqueProjectFileReference("run-a/results.csv", duplicates)).toBeUndefined()
    expect(resolveUniqueProjectFileReference("results.csv", duplicates)).toBeUndefined()
    expect(resolveUniqueProjectFileReference("results.csv", ["run-a/results.csv"], { complete: false })).toBeUndefined()
    expect(resolveUniqueProjectFileReference("results.csv", ["/private/tmp/results.csv"])).toBeUndefined()
    expect(resolveUniqueProjectFileReference("results.csv", ["../outside/results.csv"])).toBeUndefined()
  })
})
