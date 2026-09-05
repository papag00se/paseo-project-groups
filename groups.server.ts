import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { ProjectGroup } from "./groups.shared";

interface StoredData {
  version: 1;
  groups: ProjectGroup[];
}

const dataFile = join(
  process.env.PASEO_HOME || join(homedir(), ".paseo"),
  "plugin-data",
  "project-groups.json",
);

function clean(data: unknown): StoredData {
  if (!data || typeof data !== "object" || !("groups" in data) || !Array.isArray(data.groups)) {
    return { version: 1, groups: [] };
  }
  const groups = data.groups.flatMap((candidate): ProjectGroup[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const group = candidate as Partial<ProjectGroup>;
    if (typeof group.id !== "string" || typeof group.name !== "string") return [];
    return [{
      id: group.id,
      name: group.name.trim() || "Untitled",
      icon: typeof group.icon === "string" && group.icon.trim() ? group.icon.trim() : null,
      projectIds: Array.isArray(group.projectIds)
        ? [...new Set(group.projectIds.filter((id): id is string => typeof id === "string"))]
        : [],
    }];
  });
  return { version: 1, groups };
}

async function load(): Promise<StoredData> {
  try {
    return clean(JSON.parse(await readFile(dataFile, "utf8")));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { version: 1, groups: [] };
    throw error;
  }
}

async function save(data: StoredData): Promise<void> {
  await mkdir(dirname(dataFile), { recursive: true });
  const temporary = `${dataFile}.tmp-${process.pid}-${randomUUID()}`;
  await writeFile(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, dataFile);
}

let mutationChain = Promise.resolve();
function mutate<T>(operation: (data: StoredData) => T | Promise<T>): Promise<T> {
  const result = mutationChain.then(async () => {
    const data = await load();
    const value = await operation(data);
    await save(data);
    return value;
  });
  mutationChain = result.then(() => undefined, () => undefined);
  return result;
}

export async function getGroups() {
  return load();
}

export async function addGroup(input: { name: string; icon: string | null }) {
  return mutate((data) => {
    const group: ProjectGroup = {
      id: randomUUID(),
      name: input.name.trim(),
      icon: input.icon?.trim() || null,
      projectIds: [],
    };
    data.groups.push(group);
    return group;
  });
}

export async function editGroup(input: { id: string; name: string; icon: string | null }) {
  return mutate((data) => {
    const group = data.groups.find(({ id }) => id === input.id);
    if (!group) throw new Error("Group not found");
    group.name = input.name.trim();
    group.icon = input.icon?.trim() || null;
    return group;
  });
}

export async function removeGroup(input: { id: string }) {
  return mutate((data) => {
    const before = data.groups.length;
    data.groups = data.groups.filter(({ id }) => id !== input.id);
    return { deleted: data.groups.length !== before };
  });
}

export async function moveProject(input: { projectId: string; groupId: string | null }) {
  return mutate((data) => {
    for (const group of data.groups) {
      group.projectIds = group.projectIds.filter((id) => id !== input.projectId);
    }
    if (input.groupId !== null) {
      const target = data.groups.find(({ id }) => id === input.groupId);
      if (!target) throw new Error("Group not found");
      target.projectIds.push(input.projectId);
    }
    return { groups: data.groups };
  });
}
