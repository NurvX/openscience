import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js"
import type { JSX } from "solid-js"
import type { PluginContext } from "molstar/lib/mol-plugin/context"
import type { BuiltInTrajectoryFormat } from "molstar/lib/mol-plugin-state/formats/trajectory"
import type { ArtifactRenderProps } from "../registry"
import { analyzeMolecularSource, narrowMolecularSource } from "./model"

/**
 * 3D molecular structure renderer backed by Mol* (molstar), used for both the
 * `protein-structure` (proteins / macromolecules, .pdb / .cif / mmCIF) and
 * `chem-3d` (small molecules, .sdf / .mol / .xyz) artifact kinds.
 *
 * Mol* is a framework-agnostic vanilla-JS/WebGL library — it is driven here via
 * a plain `<div>` ref and its headless `PluginContext` (NO React UI layer, so no
 * `react`/`react-dom` peer dep is pulled in). The plugin is created once in
 * `onMount`, structures (re)load reactively via `createEffect` when `props.data`
 * changes, and the WebGL context is released in `onCleanup`.
 *
 * Accepted `props.data` shapes (all optional, first match wins):
 *   { id: "1CBS" }                       // PDB id → fetched from RCSB (mmCIF)
 *   { url: "https://…/model.cif" }       // any structure file URL
 *   { pdb: "<PDB text>" }                // inline PDB
 *   { cif: "<mmCIF text>" }              // inline mmCIF
 *   { sdf | mol | xyz | mol2: "…" }      // inline small-molecule formats
 *   { data: "<text>", format?: "pdb" }   // generic inline + explicit format
 * A bare string is treated as a 4-char PDB id, otherwise as inline text.
 */

type Status = "idle" | "loading" | "ready" | "empty" | "error"

export function ProteinStructure(props: ArtifactRenderProps): JSX.Element {
  let host!: HTMLDivElement
  const [plugin, setPlugin] = createSignal<PluginContext | undefined>()
  const [status, setStatus] = createSignal<Status>("idle")
  const [error, setError] = createSignal<string>("")
  const summary = createMemo(() => analyzeMolecularSource(props.data, props.kind))
  let disposed = false
  let token = 0

  onMount(async () => {
    setStatus("loading")
    try {
      const [ctxMod, specMod, configMod] = await Promise.all([
        import("molstar/lib/mol-plugin/context"),
        import("molstar/lib/mol-plugin/spec"),
        import("molstar/lib/mol-plugin/config"),
      ])
      const spec = specMod.DefaultPluginSpec()
      // Mol* otherwise asks WebGL to fail on software renderers. Chromium uses
      // SwiftShader in headless mode, and some user machines have no accepted
      // hardware context, so that default turns a usable 3D view into an error.
      spec.config = [...(spec.config ?? []), [configMod.PluginConfig.General.AllowMajorPerformanceCaveat, true]]
      const p = new ctxMod.PluginContext(spec)
      await p.init()
      if (disposed) {
        p.dispose()
        return
      }
      const ok = await p.mountAsync(host)
      if (!ok) throw new Error("Mol* failed to initialise WebGL")
      if (disposed) {
        p.dispose()
        return
      }
      setPlugin(p)
    } catch (e) {
      if (!disposed) {
        setError(e instanceof Error ? e.message : String(e))
        setStatus("error")
      }
    }
  })

  createEffect(() => {
    const p = plugin()
    const data = props.data
    const kind = props.kind
    if (!p) return
    void load(p, data, kind)
  })

  async function load(p: PluginContext, data: unknown, kind: string) {
    const my = ++token
    const src = narrowMolecularSource(data, kind)
    if (!src) {
      await p.clear().catch(() => {})
      if (my === token) setStatus("empty")
      return
    }
    setStatus("loading")
    setError("")
    try {
      await p.clear()
      if (my !== token || disposed) return
      const raw = src.url
        ? await p.builders.data.download({ url: src.url, isBinary: src.binary ?? false }, { state: { isGhost: true } })
        : await p.builders.data.rawData({ data: src.raw ?? "" })
      if (my !== token || disposed) return
      const trajectory = await p.builders.structure.parseTrajectory(raw, src.format as BuiltInTrajectoryFormat)
      if (my !== token || disposed) return
      await p.builders.structure.hierarchy.applyPreset(trajectory, "default")
      if (my !== token || disposed) return
      p.handleResize()
      setStatus("ready")
    } catch (e) {
      if (my === token && !disposed) {
        setError(e instanceof Error ? e.message : String(e))
        setStatus("error")
      }
    }
  }

  onCleanup(() => {
    disposed = true
    token++
    const p = plugin()
    if (!p) return
    try {
      p.dispose()
    } catch {
      /* ignore teardown errors — WebGL context may already be gone */
    }
  })

  const height = () => props.height ?? 420

  return (
    <div
      data-component="mol-structure"
      data-kind={props.kind}
      style={{
        position: "relative",
        width: "100%",
        height: `${height()}px`,
        overflow: "hidden",
        "border-radius": "4px",
        background: "#0b0d12",
      }}
    >
      <div ref={host} style={{ position: "absolute", inset: "0" }} />
      <Show when={summary()}>
        {(value) => (
          <div
            data-component="molecular-summary"
            style={{
              position: "absolute",
              left: "12px",
              bottom: "12px",
              display: "grid",
              gap: "7px",
              padding: "10px 11px",
              "max-width": "min(360px, calc(100% - 24px))",
              "border-radius": "7px",
              border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(9, 12, 18, 0.82)",
              "backdrop-filter": "blur(12px)",
              color: "#e8ebf2",
              "font-family": "ui-sans-serif, system-ui, sans-serif",
              "font-size": "11px",
              "line-height": 1.35,
              "z-index": 2,
            }}
          >
            <div style={{ display: "flex", "align-items": "center", gap: "8px", "flex-wrap": "wrap" }}>
              <strong style={{ "font-size": "11px", "letter-spacing": "0.02em" }}>
                {value().format.toUpperCase()}
              </strong>
              <Show when={value().atomCount !== undefined}>
                <span>{value().atomCount} atoms</span>
              </Show>
              <Show when={value().bondCount !== undefined}>
                <span>{value().bondCount} bonds</span>
              </Show>
              <Show when={value().residueCount !== undefined}>
                <span>{value().residueCount} residues</span>
              </Show>
              <Show when={value().chainCount !== undefined}>
                <span>{value().chainCount} chains</span>
              </Show>
              <Show when={value().moleculeCount !== undefined}>
                <span>{value().moleculeCount} molecules</span>
              </Show>
            </div>
            <Show when={value().elements.length}>
              <div style={{ display: "flex", gap: "5px", "flex-wrap": "wrap", color: "#bac2d2" }}>
                <For each={value().elements}>
                  {(item) => (
                    <span
                      style={{
                        padding: "2px 5px",
                        "border-radius": "4px",
                        background: "rgba(255,255,255,0.08)",
                      }}
                    >
                      {item.element} {item.count}
                    </span>
                  )}
                </For>
              </div>
            </Show>
            <For each={value().warnings}>
              {(warning) => <span style={{ color: "#f2c879" }}>{warning}</span>}
            </For>
          </div>
        )}
      </Show>
      <Show when={status() !== "ready"}>
        <div
          style={{
            position: "absolute",
            inset: "0",
            display: "flex",
            "align-items": "center",
            "justify-content": "center",
            "text-align": "center",
            padding: "12px",
            "pointer-events": "none",
            color: "#c7ccd6",
            font: "13px/1.5 ui-sans-serif, system-ui, sans-serif",
          }}
        >
          <Show when={status() === "loading"}>Loading 3D structure…</Show>
          <Show when={status() === "empty"}>
            <span>
              No structure to display.
              <br />
              Provide a PDB id, a structure URL, or inline PDB/mmCIF text.
            </span>
          </Show>
          <Show when={status() === "error"}>
            <span style={{ color: "#ff8f8f" }}>Could not render structure: {error()}</span>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export default ProteinStructure
