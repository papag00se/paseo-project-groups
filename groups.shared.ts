import { defineRpc } from "@getpaseo/plugin/server";
import { z } from "zod";

export const projectGroupSchema = z.object({
  id: z.string(),
  name: z.string(),
  icon: z.string().nullable(),
  projectIds: z.array(z.string()),
});

export const listGroups = defineRpc({
  name: "groups.list",
  input: z.object({}),
  output: z.object({ groups: z.array(projectGroupSchema) }),
});

export const createGroup = defineRpc({
  name: "groups.create",
  input: z.object({
    name: z.string().trim().min(1).max(80),
    icon: z.string().trim().max(2048).nullable(),
  }),
  output: projectGroupSchema,
});

export const updateGroup = defineRpc({
  name: "groups.update",
  input: z.object({
    id: z.string(),
    name: z.string().trim().min(1).max(80),
    icon: z.string().trim().max(2048).nullable(),
  }),
  output: projectGroupSchema,
});

export const deleteGroup = defineRpc({
  name: "groups.delete",
  input: z.object({ id: z.string() }),
  output: z.object({ deleted: z.boolean() }),
});

export const assignProject = defineRpc({
  name: "groups.assign-project",
  input: z.object({ projectId: z.string(), groupId: z.string().nullable() }),
  output: z.object({ groups: z.array(projectGroupSchema) }),
});

export type ProjectGroup = z.output<typeof projectGroupSchema>;
