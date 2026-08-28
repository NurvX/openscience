import { describe, expect, test } from "bun:test"
import { CORE_SCIENCE_RUNTIME } from "../../src/science/capability/pack"
import { CapabilityRegistry } from "../../src/science/capability/registry"
import { CapabilityWorkload } from "../../src/science/capability/schema"

describe("scientific capability registry", () => {
  test("exposes the honest 54-entry maturity and availability inventory", () => {
    const items = CapabilityRegistry.list()
    expect(items).toHaveLength(54)
    expect(items.every((item) => item.maturity === "experimental" || item.maturity === "blocked")).toBe(true)
    expect(items.find((item) => item.id === "scipy")).toMatchObject({
      maturity: "experimental",
      availability: { local: "setup_needed", hosted: "setup_needed" },
    })
    expect(items.find((item) => item.id === "boltz2")).toMatchObject({
      maturity: "experimental",
      availability: { local: "unavailable", hosted: "setup_needed" },
    })
    expect(items.find((item) => item.id === "paper-qa")).toMatchObject({
      maturity: "experimental",
      availability: { local: "setup_needed", hosted: "unavailable" },
    })
    expect(items.find((item) => item.id === "alphafold2")).toMatchObject({
      maturity: "blocked",
      availability: { local: "unavailable", hosted: "unavailable" },
    })
    expect(items.filter((item) => item.maturity === "experimental")).toHaveLength(51)
    expect(items.filter((item) => item.maturity === "blocked")).toHaveLength(3)
  })

  test("owns one immutable exact runtime graph for the five packaged capabilities", () => {
    expect(CORE_SCIENCE_RUNTIME.packages).toHaveLength(18)
    expect(CORE_SCIENCE_RUNTIME.packages).toContain("scipy==1.18.1")
    expect(CORE_SCIENCE_RUNTIME.packages).toContain("matplotlib==3.11.1")
    expect(CORE_SCIENCE_RUNTIME.packages).toContain("scikit-learn==1.9.0")
    expect(CORE_SCIENCE_RUNTIME.packages).toContain("biopython==1.88")
    expect(CORE_SCIENCE_RUNTIME.packages).toContain("rdkit==2026.3.5")
    expect(CORE_SCIENCE_RUNTIME.packages.every((item) => /^[A-Za-z0-9_.-]+==[^=<>!~\s]+$/.test(item))).toBe(true)
    expect(CORE_SCIENCE_RUNTIME.image).toMatch(/@sha256:[a-f0-9]{64}$/)
    expect(CORE_SCIENCE_RUNTIME.lock_digest).toMatch(/^[a-f0-9]{64}$/)
    for (const id of ["scipy", "matplotlib", "scikit-learn", "biopython", "rdkit"]) {
      expect(CapabilityRegistry.describe(id)?.runtime).toEqual(CORE_SCIENCE_RUNTIME)
    }
  })

  test("compiles a bounded zero-default-upload Modal plan without caller environment overrides", async () => {
    const result = await CapabilityRegistry.compileTask("scipy", {
      name: "Fit model",
      purpose: "Fit and validate the requested model.",
      command: "python analysis.py",
      target: "modal",
      artifacts: ["results.json"],
    })
    expect(result.tool).toBe("compute_job")
    expect(result.binding).toMatchObject({ id: "scipy", version: "2.0.0", profile: "task" })
    expect(result.input).toMatchObject({
      action: "plan",
      target: { kind: "modal" },
      packages: CORE_SCIENCE_RUNTIME.packages,
      image: CORE_SCIENCE_RUNTIME.image,
      gpu: "none",
      uploads: [],
    })
    expect(result.input.resources).toMatchObject({ cpus: 1, memory_gb: 2, time_minutes: 10, gpus: 0 })
    expect(
      CapabilityWorkload.safeParse({
        name: "Override",
        purpose: "Attempt to replace the environment.",
        command: "python analysis.py",
        target: "modal",
        packages: ["numpy==0.0.1"],
      }).success,
    ).toBe(false)
  })

  test("compiles canonical zero-input smokes and enforces resource ceilings", async () => {
    const smoke = await CapabilityRegistry.compileSmoke("rdkit", "modal", "scientific-capabilities/rdkit/test")
    expect(smoke.binding.profile).toBe("smoke")
    expect(smoke.input.uploads).toEqual([])
    expect(smoke.input.artifacts).toContain("capability-result.json")
    expect(smoke.input.command).toContain("base64")
    await expect(
      CapabilityRegistry.compileTask("scipy", {
        name: "Too large",
        purpose: "Exceed the reviewed resource envelope.",
        command: "python analysis.py",
        target: "modal",
        resources: { cpus: 2 },
      }),
    ).rejects.toThrow("capped at 1 CPU")
  })

  test("keeps hosted BioNeMo and AlphaFold2 claims truthful", () => {
    expect(CapabilityRegistry.describe("diffdock")).toMatchObject({
      maturity: "experimental",
      availability: { local: "unavailable", hosted: "setup_needed" },
      hosted: { kind: "nvidia_nim", adapter_id: "diffdock" },
    })
    expect(CapabilityRegistry.describe("alphafold2")).toMatchObject({
      maturity: "blocked",
      blocker: expect.stringContaining("weights"),
    })
    expect(CapabilityRegistry.describe("not-real")).toBeUndefined()
  })
})
