export namespace ResearchRouting {
  export type Route = "managed" | "firecrawl_byok" | "community"

  export type Access = {
    mode: "byok" | "managed"
    aceEnabled: boolean
    managedUnlocked: boolean
    firecrawl: boolean
  }

  /** Follow the same explicit access choice as model inference. Ace eligibility
   * alone must not override BYOK and silently turn a Firecrawl request into a
   * managed operation. */
  export function select(input: Access): Route {
    if (input.mode === "managed") {
      if (input.aceEnabled && input.managedUnlocked) return "managed"
      return "community"
    }
    if (input.firecrawl) return "firecrawl_byok"
    return "community"
  }
}
