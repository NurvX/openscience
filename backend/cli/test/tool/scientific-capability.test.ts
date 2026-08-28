import { describe, expect, test } from "bun:test"
import z from "zod"
import { ScientificCapabilityParameters, ScientificCapabilityTool } from "../../src/tool/scientific-capability"

const context = {
  sessionID: "ses_scientific_capability",
  messageID: "msg_scientific_capability",
  callID: "call_scientific_capability",
  agent: "research",
  abort: new AbortController().signal,
  messages: [],
  metadata() {},
  async ask() {},
}

describe("scientific_capability tool", () => {
  test("advertises one strict object-rooted lifecycle contract", () => {
    const schema = z.toJSONSchema(ScientificCapabilityParameters) as {
      type?: string
      required?: string[]
      properties?: { action?: { enum?: string[] } }
    }
    expect(schema.type).toBe("object")
    expect(schema.required).toEqual(["action"])
    expect(schema.properties?.action?.enum).toEqual([
      "list",
      "describe",
      "doctor",
      "setup",
      "plan",
      "start",
      "smoke",
      "status",
      "wait",
      "logs",
      "artifacts",
      "verify",
      "cancel",
      "retry_delivery",
      "release",
    ])
    expect(ScientificCapabilityParameters.safeParse({ action: "describe" }).success).toBe(false)
    expect(ScientificCapabilityParameters.safeParse({ action: "smoke", id: "scipy" }).success).toBe(false)
    expect(ScientificCapabilityParameters.safeParse({ action: "smoke", id: "scipy", target: "modal" }).success).toBe(
      true,
    )
    expect(
      ScientificCapabilityParameters.safeParse({
        action: "plan",
        id: "scipy",
        packages: ["numpy==0.0.1"],
      }).success,
    ).toBe(false)
    expect(ScientificCapabilityParameters.safeParse({ action: "verify", id: "scipy" }).success).toBe(false)
  })

  test("lists the honest 54-entry maturity and availability inventory without claiming verification", async () => {
    const tool = await ScientificCapabilityTool.init()
    const listed = await tool.execute({ action: "list" }, context)
    const catalog = JSON.parse(listed.output) as {
      capabilities: Array<{ id: string; maturity: string; availability: { local: string; hosted: string } }>
    }
    expect(catalog.capabilities).toHaveLength(54)
    expect(catalog.capabilities.every((item) => item.maturity !== "verified")).toBe(true)
    expect(catalog.capabilities.find((item) => item.id === "boltz2")?.availability.hosted).toBe("setup_needed")
    expect(catalog.capabilities.find((item) => item.id === "paper-qa")?.availability.local).toBe("setup_needed")
    expect(catalog.capabilities.filter((item) => item.maturity === "blocked")).toHaveLength(3)
    expect(listed.metadata.scientific_capability.dispatched).toBe(false)
  })

  test("compiles a packaged plan without dispatching or exposing environment controls", async () => {
    const tool = await ScientificCapabilityTool.init()
    const planned = await tool.execute(
      {
        action: "plan",
        id: "scipy",
        name: "Fit model",
        purpose: "Fit and validate the requested model.",
        command: "python analysis.py",
        target: "modal",
        artifacts: ["results.json"],
      },
      context,
    )
    const proposal = JSON.parse(planned.output) as {
      tool: string
      input: { action: string; packages: string[]; image: string; uploads: string[]; gpu: string }
    }
    expect(proposal.tool).toBe("compute_job")
    expect(proposal.input.action).toBe("plan")
    expect(proposal.input.packages).toContain("scipy==1.18.1")
    expect(proposal.input.image).toMatch(/@sha256:/)
    expect(proposal.input.uploads).toEqual([])
    expect(proposal.input.gpu).toBe("none")
    expect(planned.metadata.scientific_capability.dispatched).toBe(false)
  })

  test("previews strict hosted BioNeMo requests and fails blocked work closed", async () => {
    const tool = await ScientificCapabilityTool.init()
    const hosted = await tool.execute(
      {
        action: "plan",
        id: "boltz2",
        payload: { polymers: [{ molecule_type: "protein", sequence: "MVLTIYPDELVQIVSDKK" }] },
      },
      context,
    )
    const preview = JSON.parse(hosted.output) as { method: string; endpoint: string; dispatched: boolean }
    expect(preview.method).toBe("POST")
    expect(preview.endpoint).toBe("https://health.api.nvidia.com/v1/biology/mit/boltz2/predict")
    expect(preview.dispatched).toBe(false)
    await expect(
      tool.execute(
        { action: "plan", id: "diffdock", payload: { protein: "ATOM", ligand: "CCO", extra: true } },
        context,
      ),
    ).rejects.toThrow()

    const blocked = await tool.execute({ action: "plan", id: "alphafold2" }, context)
    expect(JSON.parse(blocked.output)).toMatchObject({ maturity: "blocked", dispatched: false })
    await expect(tool.execute({ action: "start", id: "alphafold2" }, context)).rejects.toThrow("weights")
  })

  test("returns setup guidance instead of pretending catalog-only entries are executable", async () => {
    const tool = await ScientificCapabilityTool.init()
    const planned = await tool.execute({ action: "plan", id: "paper-qa" }, context)
    expect(JSON.parse(planned.output)).toMatchObject({
      capability: "paper-qa",
      executable: false,
      dispatched: false,
    })
  })
})
