import { test, expect } from "./fixtures"

test.skip(
  process.env.OPENSCIENCE_E2E_FAKE_MODEL !== "1",
  "requires the deterministic model supplied by test:e2e:local (or the E2E CI harness)",
)

const ONE_PIXEL_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nH0AAAAASUVORK5CYII="

test("notebook artifact metadata renders through the science fallback", async ({ page, sdk, gotoSession }) => {
  const created = await sdk.session.create({ title: `science artifact ${Date.now()}` }).then((result) => result.data)
  if (!created?.id) throw new Error("Session create did not return an id")
  const sessionID = created.id

  try {
    const reply = await sdk.session
      .prompt({
        sessionID,
        model: { providerID: "e2e", modelID: "echo" },
        parts: [{ type: "text", text: "seed a science artifact" }],
      })
      .then((result) => result.data)

    const source = reply?.parts.find((part) => part.type === "text")
    if (!reply?.info.id || !source) throw new Error("Deterministic model did not return an assistant text part")

    const now = Date.now()
    await sdk.part.update({
      sessionID,
      messageID: reply.info.id,
      partID: source.id,
      part: {
        id: source.id,
        sessionID,
        messageID: reply.info.id,
        type: "tool",
        callID: `call_science_${now}`,
        tool: "notebook",
        state: {
          status: "completed",
          input: {},
          output: "notebook completed",
          title: "Notebook output",
          metadata: { artifact: { kind: "image", data: { images: [ONE_PIXEL_PNG] } } },
          time: { start: now, end: now },
        },
      },
    })

    const stored = await sdk.session.messages({ sessionID, limit: 50 }).then((result) => result.data ?? [])
    const storedPart = stored.flatMap((message) => message.parts).find((part) => part.id === source.id)
    expect(storedPart?.type).toBe("tool")
    if (storedPart?.type !== "tool") throw new Error("Updated tool part was not persisted")
    expect(storedPart.tool).toBe("notebook")
    expect(storedPart.state.metadata).toMatchObject({ artifact: { kind: "image" } })

    await gotoSession(sessionID)
    await expect(page).toHaveURL(new RegExp(`/session/${sessionID}$`))
    const steps = page.locator('[data-slot="session-turn-collapsible-trigger-content"]')
    await expect(steps).toBeVisible()
    await steps.click()
    await expect(page.locator('[data-component="tool-part-wrapper"]').filter({ hasText: "notebook" })).toBeVisible()
    const artifact = page.locator('[data-component="science-artifact"][data-kind="image"]')
    await expect(artifact).toBeVisible()
    const image = artifact.getByRole("img", { name: "artifact", exact: true })
    await expect(image).toBeVisible()
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(1)
  } finally {
    await sdk.session.delete({ sessionID }).catch(() => undefined)
  }
})
