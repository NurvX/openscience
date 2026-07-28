import { Hono } from "hono"
import { describeRoute, validator } from "hono-openapi"
import z from "zod"
import { Instance } from "../../project/instance"
import { pythonKernels } from "../../tool/notebook"
import { rKernels } from "../../tool/rkernel"
import type { ExecuteResult, KernelOutput } from "../../science/kernel/types"
import { Provenance } from "../../science/provenance/store"
import { lazy } from "../../util/lazy"

const Language = z.enum(["python", "r"])
const Key = z.object({
  id: z.string().trim().min(1).max(1024),
  language: Language,
})
const Execute = Key.extend({
  code: z.string().max(2_000_000),
  timeout: z.number().int().min(5_000).max(600_000).optional(),
})

type Language = z.infer<typeof Language>

const manager = (language: Language) => (language === "r" ? rKernels : pythonKernels)

const key = (id: string) => `notebook-${Bun.hash(`${Instance.directory}\0${id}`).toString(36)}`

function output(value: KernelOutput, execution: number | null) {
  if (value.type === "stream") {
    return {
      output_type: "stream",
      name: value.name ?? "stdout",
      text: value.data?.["text/plain"] ?? "",
    }
  }
  if (value.type === "error") {
    return {
      output_type: "error",
      ename: value.error?.name ?? "Error",
      evalue: value.error?.message ?? "Kernel execution failed",
      traceback: value.error?.traceback ?? [],
    }
  }
  return {
    output_type: value.type === "result" ? "execute_result" : "display_data",
    data: value.data ?? {},
    metadata: {},
    ...(value.type === "result" ? { execution_count: execution } : {}),
  }
}

function response(result: ExecuteResult) {
  const execution = result.executionCount ?? null
  return {
    ok: result.ok,
    execution_count: execution,
    outputs: result.outputs.map((value) => output(value, execution)),
  }
}

export const NotebookRoutes = lazy(() =>
  new Hono()
    .post(
      "/execute",
      describeRoute({
        summary: "Execute a notebook cell",
        description: "Execute code in a persistent project-scoped Python or R kernel.",
        operationId: "notebook.execute",
        responses: { 200: { description: "Jupyter-compatible cell outputs" } },
      }),
      validator("json", Execute),
      async (c) => {
        const body = c.req.valid("json")
        const kernel = await manager(body.language).get(key(body.id), { cwd: Instance.directory })
        const result = await kernel.execute(body.code, { timeout: body.timeout })
        const node = await Provenance.record({
          kind: "run",
          label: `${body.language} cell · ${body.id}`.slice(0, 140),
          tool: "notebook",
          sessionID: body.id,
          inputs: {
            path: body.id,
            language: body.language,
            code: body.code,
          },
          status: result.ok ? "ok" : "error",
          meta: {
            directory: Instance.directory,
            executionCount: result.executionCount ?? null,
            outputTypes: result.outputs.map((value) => value.type),
          },
        } as Parameters<typeof Provenance.record>[0])
        return c.json({ ...response(result), provenance_id: node.id })
      },
    )
    .get(
      "/status",
      describeRoute({
        summary: "Get notebook kernel status",
        operationId: "notebook.status",
        responses: { 200: { description: "Kernel state" } },
      }),
      validator("query", Key),
      (c) => {
        const query = c.req.valid("query")
        return c.json({ active: manager(query.language).active(key(query.id)), language: query.language })
      },
    )
    .post(
      "/restart",
      describeRoute({
        summary: "Restart a notebook kernel",
        operationId: "notebook.restart",
        responses: { 200: { description: "Kernel state" } },
      }),
      validator("json", Key),
      async (c) => {
        const body = c.req.valid("json")
        await manager(body.language).release(key(body.id))
        return c.json({ active: false, language: body.language })
      },
    )
    .post(
      "/interrupt",
      describeRoute({
        summary: "Interrupt a notebook kernel",
        description: "Stop the running cell and release its kernel. The next execution starts a fresh kernel.",
        operationId: "notebook.interrupt",
        responses: { 200: { description: "Kernel state" } },
      }),
      validator("json", Key),
      async (c) => {
        const body = c.req.valid("json")
        await manager(body.language).release(key(body.id))
        return c.json({ active: false, language: body.language })
      },
    ),
)
