import { describe, expect, test } from "bun:test"
import { createRequire } from "module"
import {
  linuxKernelProblem as postinstallKernelProblem,
  platformPackageNames,
} from "../../script/postinstall.mjs"

const require = createRequire(import.meta.url)
const wrapper = require("../../bin/openscience") as {
  exitCodeForResult(result: { status: number | null; signal: NodeJS.Signals | null }): number
  expectedPlatformPackages(platform: string, arch: string, musl: boolean): string[]
  linuxKernelProblem(platform: string, release: string): string | undefined
  matchingVariants(prefix: string, entries: string[], preferMusl: boolean): string[]
  parseKernelVersion(release: string): { major: number; minor: number } | undefined
}

describe("npm bin wrapper", () => {
  test("rejects Linux kernels older than the bundled runtime supports", () => {
    expect(wrapper.parseKernelVersion("3.10.0-1160.el7.x86_64")).toEqual({ major: 3, minor: 10 })
    expect(wrapper.linuxKernelProblem("linux", "3.10.0-1160.el7.x86_64")).toContain("requires kernel 5.1")
    expect(wrapper.linuxKernelProblem("linux", "5.1.0")).toBeUndefined()
    expect(wrapper.linuxKernelProblem("darwin", "23.0.0")).toBeUndefined()
    expect(postinstallKernelProblem("linux", "3.10.0-1160.el7.x86_64")).toContain("requires kernel 5.1")
  })

  test("reports signal exits using shell-compatible status codes", () => {
    expect(wrapper.exitCodeForResult({ status: 7, signal: null })).toBe(7)
    expect(wrapper.exitCodeForResult({ status: null, signal: "SIGTERM" })).toBe(143)
    expect(wrapper.exitCodeForResult({ status: null, signal: null })).toBe(1)
  })

  test("prefers the matching libc and exact native package", () => {
    const entries = [
      "openscience-linux-x64-baseline-musl",
      "openscience-linux-x64-baseline",
      "openscience-linux-x64-musl",
      "openscience-linux-x64",
    ]

    expect(wrapper.matchingVariants("openscience-linux-x64", entries, false).slice(0, 2)).toEqual([
      "openscience-linux-x64",
      "openscience-linux-x64-baseline",
    ])
    expect(wrapper.matchingVariants("openscience-linux-x64", entries, true).slice(0, 2)).toEqual([
      "openscience-linux-x64-musl",
      "openscience-linux-x64-baseline-musl",
    ])
  })

  test("names the native arm64 package in diagnostics and postinstall lookup", () => {
    expect(wrapper.expectedPlatformPackages("linux", "arm64", false)).toEqual([
      "@synsci/openscience-linux-arm64",
      "openscience-linux-arm64",
    ])
    expect(platformPackageNames("linux", "arm64", true)).toEqual([
      "@synsci/openscience-linux-arm64-musl",
      "openscience-linux-arm64-musl",
    ])
  })
})
