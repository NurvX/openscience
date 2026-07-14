import { expect, test } from "bun:test"
import { settingsApi } from "./api"

test("settingsApi removes a trailing slash from a mounted route root", async () => {
  let requested = ""
  const fetchFn = (async (input: RequestInfo | URL) => {
    requested = String(input)
    return Response.json({ ok: true })
  }) as typeof fetch

  await settingsApi("http://127.0.0.1:4096/", fetchFn, "/settings/local/")

  expect(requested).toBe("http://127.0.0.1:4096/settings/local")
})
