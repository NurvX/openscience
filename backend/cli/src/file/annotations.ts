import path from "node:path"
import { ulid } from "ulid"
import z from "zod"
import { Instance } from "../project/instance"
import { Storage } from "../storage/storage"

export namespace ArtifactAnnotation {
  export const Anchor = z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("artifact"),
      label: z.string().trim().max(500).optional(),
    }),
    z.object({
      kind: z.literal("text"),
      startLine: z.number().int().min(1),
      endLine: z.number().int().min(1),
      quote: z.string().max(10_000).optional(),
    }),
    z.object({
      kind: z.literal("notebook"),
      cellId: z.string().trim().min(1).max(500),
      line: z.number().int().min(1).optional(),
    }),
    z.object({
      kind: z.literal("molecule"),
      selection: z.string().trim().min(1).max(2_000),
      count: z.number().int().min(1).optional(),
    }),
    z.object({
      kind: z.literal("genome"),
      chromosome: z.string().trim().min(1).max(200),
      start: z.number().int().min(0),
      end: z.number().int().min(0),
    }),
  ])
  export type Anchor = z.infer<typeof Anchor>

  export const Message = z.object({
    id: z.string(),
    body: z.string(),
    author: z.string(),
    createdAt: z.number(),
  })
  export type Message = z.infer<typeof Message>

  export const Info = z.object({
    id: z.string(),
    projectID: z.string(),
    path: z.string(),
    anchor: Anchor,
    messages: Message.array(),
    status: z.enum(["open", "resolved"]),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  export type Info = z.infer<typeof Info>

  export const Create = z.object({
    path: z.string().trim().min(1).max(10_000),
    body: z.string().trim().min(1).max(100_000),
    author: z.string().trim().min(1).max(200).optional(),
    anchor: Anchor.default({ kind: "artifact" }),
  })
  export type Create = z.infer<typeof Create>

  export const Update = z
    .object({
      status: z.enum(["open", "resolved"]).optional(),
      reply: z.string().trim().min(1).max(100_000).optional(),
      author: z.string().trim().min(1).max(200).optional(),
    })
    .refine((value) => value.status !== undefined || value.reply !== undefined, "No annotation update supplied")
  export type Update = z.infer<typeof Update>

  const prefix = () => ["artifact_annotation", Instance.project.id]
  const key = (id: string) => [...prefix(), id]

  async function target(value: string) {
    const absolute = path.resolve(Instance.directory, value)
    if (!(await Instance.containsCanonicalPath(absolute))) {
      throw new Error(`Annotation target is outside the project: ${value}`)
    }
    return path.relative(Instance.directory, absolute).replaceAll("\\", "/")
  }

  export async function list(filepath: string) {
    const relative = await target(filepath)
    const keys = await Storage.list(prefix())
    const records = await Promise.all(keys.map((item) => Storage.read<Info>(item)))
    return records.filter((item) => item.path === relative).toSorted((a, b) => a.createdAt - b.createdAt)
  }

  export async function create(input: Create) {
    const now = Date.now()
    const id = `ann_${ulid()}`
    const record: Info = {
      id,
      projectID: Instance.project.id,
      path: await target(input.path),
      anchor: input.anchor,
      messages: [
        {
          id: `msg_${ulid()}`,
          body: input.body,
          author: input.author ?? "You",
          createdAt: now,
        },
      ],
      status: "open",
      createdAt: now,
      updatedAt: now,
    }
    await Storage.write(key(id), record)
    return record
  }

  export async function update(id: string, input: Update) {
    return Storage.update<Info>(key(id), (record) => {
      if (input.status) record.status = input.status
      if (input.reply) {
        record.messages.push({
          id: `msg_${ulid()}`,
          body: input.reply,
          author: input.author ?? "You",
          createdAt: Date.now(),
        })
      }
      record.updatedAt = Date.now()
    })
  }

  export async function remove(id: string) {
    await Storage.remove(key(id))
    return { deleted: true as const }
  }
}
