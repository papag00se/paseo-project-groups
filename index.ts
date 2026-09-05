import type { PluginContext } from "@getpaseo/plugin";
import { addGroup, editGroup, getGroups, moveProject, removeGroup } from "./groups.server";
import {
  assignProject,
  createGroup,
  deleteGroup,
  listGroups,
  updateGroup,
} from "./groups.shared";
import { MainSurface } from "./main.client";

export default function contribute(plugin: PluginContext) {
  plugin.handle(listGroups, getGroups);
  plugin.handle(createGroup, addGroup);
  plugin.handle(updateGroup, editGroup);
  plugin.handle(deleteGroup, removeGroup);
  plugin.handle(assignProject, moveProject);

  plugin.addSurface("main", MainSurface);
  plugin.addSidebarItem({
    id: "main",
    title: "Project groups",
    icon: "FolderTree",
    surface: "main",
  });

  return () => {};
}
