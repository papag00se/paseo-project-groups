import { type PluginSurfaceProps, usePaseo, useRpc } from "@getpaseo/plugin";
import { Icon, Modal, useToast } from "@getpaseo/plugin/react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  assignProject,
  createGroup,
  deleteGroup,
  listGroups,
  type ProjectGroup,
  updateGroup,
} from "./groups.shared";

type StatusBucket = "needs_input" | "failed" | "running" | "attention" | "done";

type Project = {
  projectId: string;
  projectDisplayName: string;
  projectRootPath: string;
};

type Workspace = {
  id: string;
  projectId: string;
  name: string;
  title: string | null;
  status: StatusBucket;
  statusEnteredAt: string | null;
};

const STATUS_PRIORITY: readonly StatusBucket[] = [
  "needs_input",
  "failed",
  "running",
  "attention",
  "done",
];

function aggregateStatus(statuses: Iterable<StatusBucket>): StatusBucket | null {
  let best: StatusBucket | null = null;
  let rank = STATUS_PRIORITY.length;
  for (const status of statuses) {
    const nextRank = STATUS_PRIORITY.indexOf(status);
    if (nextRank >= 0 && nextRank < rank) {
      best = status;
      rank = nextRank;
    }
  }
  return best;
}

function projectStatus(projectId: string, workspaces: readonly Workspace[]): StatusBucket | null {
  return aggregateStatus(
    workspaces.filter((workspace) => workspace.projectId === projectId).map(({ status }) => status),
  );
}

function isImageIcon(icon: string | null): boolean {
  return Boolean(icon && /^(https?:\/\/|data:image\/)/i.test(icon));
}

function initialFor(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

function IdentityIcon({
  name,
  icon,
  status,
  size,
  theme,
}: {
  name: string;
  icon: string | null;
  status: StatusBucket | null;
  size: number;
  theme: PluginSurfaceProps["theme"];
}) {
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => setImageFailed(false), [icon]);
  const customText = icon && !isImageIcon(icon) ? Array.from(icon)[0] : null;

  return (
    <View style={{ width: size, height: size, position: "relative", flexShrink: 0 }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: Math.max(7, Math.round(size * 0.25)),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.surface2,
          borderColor: theme.colors.border,
          borderWidth: 1,
          overflow: "hidden",
        }}
      >
        {isImageIcon(icon) && !imageFailed ? (
          <Image
            accessibilityLabel={`${name} icon`}
            onError={() => setImageFailed(true)}
            source={{ uri: icon! }}
            style={{ width: size, height: size }}
          />
        ) : (
          <Text
            numberOfLines={1}
            style={{
              color: theme.colors.foreground,
              fontSize: customText ? Math.round(size * 0.56) : Math.round(size * 0.42),
              fontWeight: "700",
            }}
          >
            {customText || initialFor(name)}
          </Text>
        )}
      </View>
      <StatusBadge status={status} theme={theme} />
    </View>
  );
}

function StatusBadge({
  status,
  theme,
}: {
  status: StatusBucket | null;
  theme: PluginSurfaceProps["theme"];
}) {
  if (!status || status === "done") return null;
  const shell = {
    position: "absolute" as const,
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: theme.colors.surface0,
  };
  if (status === "running") {
    return (
      <View accessibilityLabel="Agent working" style={shell}>
        <ActivityIndicator color={theme.colors.accent} size="small" />
      </View>
    );
  }
  if (status === "needs_input") {
    return (
      <View accessibilityLabel="Agent waiting for input" style={shell}>
        <Icon name="CircleAlert" size={13} color={theme.colors.statusWarning} />
      </View>
    );
  }
  const color = status === "failed" ? theme.colors.statusDanger : theme.colors.statusSuccess;
  return (
    <View accessibilityLabel={status === "failed" ? "Agent failed" : "Unseen completed work"} style={shell}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} />
    </View>
  );
}

export function MainSurface({ theme, host, layout, navigation }: PluginSurfaceProps) {
  const paseo = usePaseo();
  const toast = useToast();
  const queryClient = useQueryClient();
  const callListGroups = useRpc(listGroups);
  const callCreateGroup = useRpc(createGroup);
  const callUpdateGroup = useRpc(updateGroup);
  const callDeleteGroup = useRpc(deleteGroup);
  const callAssignProject = useRpc(assignProject);
  const groupsKey = useMemo(() => ["project-groups", host.id, "groups"] as const, [host.id]);
  const projectsKey = useMemo(() => ["project-groups", host.id, "projects"] as const, [host.id]);
  const workspacesKey = useMemo(() => ["project-groups", host.id, "workspaces"] as const, [host.id]);

  const groupsQuery = useQuery({
    queryKey: groupsKey,
    queryFn: async () => (await callListGroups({})).groups,
  });
  const projectsQuery = useQuery({
    queryKey: projectsKey,
    queryFn: async () => (await paseo.projects.list()).projects as Project[],
    refetchInterval: 15_000,
  });
  const workspacesQuery = useQuery({
    queryKey: workspacesKey,
    queryFn: async () =>
      (await paseo.workspaces.list({ page: { limit: 200 }, subscribe: {} })).entries as Workspace[],
  });

  useEffect(() => {
    return paseo.workspaces.subscribe((update) => {
      queryClient.setQueryData<Workspace[]>(workspacesKey, (current = []) => {
        if (update.kind === "upsert") {
          const workspace = update.workspace as Workspace;
          return [...current.filter(({ id }) => id !== workspace.id), workspace];
        }
        return current.filter(({ id }) => id !== update.id);
      });
      void queryClient.invalidateQueries({ queryKey: projectsKey });
    });
  }, [paseo, projectsKey, queryClient, workspacesKey]);

  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const [editingGroup, setEditingGroup] = useState<ProjectGroup | "new" | null>(null);
  const [movingProject, setMovingProject] = useState<Project | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<ProjectGroup | null>(null);

  const mutation = useMutation({
    mutationFn: async (action:
      | { kind: "create"; name: string; icon: string | null }
      | { kind: "update"; id: string; name: string; icon: string | null }
      | { kind: "delete"; id: string }
      | { kind: "assign"; projectId: string; groupId: string | null }) => {
      if (action.kind === "create") return callCreateGroup(action);
      if (action.kind === "update") return callUpdateGroup(action);
      if (action.kind === "delete") return callDeleteGroup(action);
      return callAssignProject(action);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: groupsKey });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Unable to save project groups"),
  });

  const groups = groupsQuery.data ?? [];
  const projects = [...(projectsQuery.data ?? [])].sort((a, b) =>
    a.projectDisplayName.localeCompare(b.projectDisplayName),
  );
  const workspaces = workspacesQuery.data ?? [];
  const assignedIds = new Set(groups.flatMap(({ projectIds }) => projectIds));
  const ungrouped = projects.filter(({ projectId }) => !assignedIds.has(projectId));

  const styles = useMemo(
    () =>
      StyleSheet.create({
        screen: { flex: 1, backgroundColor: theme.colors.surface0 },
        content: {
          padding: layout.compact ? 14 : 22,
          gap: 14,
          width: "100%",
          maxWidth: 880,
          alignSelf: "center",
        },
        header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
        title: { color: theme.colors.foreground, fontSize: layout.compact ? 22 : 26, fontWeight: "700" },
        subtitle: { color: theme.colors.foregroundMuted, marginTop: 3 },
        primaryButton: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, backgroundColor: theme.colors.accent },
        primaryButtonText: { color: theme.colors.accentForeground, fontWeight: "700" },
        card: { borderWidth: 1, borderColor: theme.colors.border, borderRadius: 12, backgroundColor: theme.colors.surface1, overflow: "hidden" },
        groupHeader: { minHeight: 58, paddingHorizontal: 13, paddingVertical: 10, flexDirection: "row", alignItems: "center", gap: 11 },
        groupName: { color: theme.colors.foreground, fontSize: 16, fontWeight: "700", flex: 1 },
        count: { color: theme.colors.foregroundMuted, fontSize: 12 },
        iconButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center", borderRadius: 8 },
        projects: { borderTopWidth: 1, borderTopColor: theme.colors.border },
        projectRow: { minHeight: 54, paddingHorizontal: 14, paddingVertical: 9, flexDirection: "row", alignItems: "center", gap: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.border },
        projectText: { flex: 1, minWidth: 0 },
        projectName: { color: theme.colors.foreground, fontWeight: "600" },
        projectPath: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 2 },
        empty: { color: theme.colors.foregroundMuted, paddingHorizontal: 16, paddingVertical: 14, fontStyle: "italic" },
        error: { color: theme.colors.statusDanger },
        modalBody: { gap: 14, paddingBottom: 8 },
        label: { color: theme.colors.foreground, fontWeight: "600", marginBottom: 6 },
        hint: { color: theme.colors.foregroundMuted, fontSize: 12, marginTop: 5 },
        input: { color: theme.colors.foreground, backgroundColor: theme.colors.surface2, borderColor: theme.colors.border, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
        modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: 9, marginTop: 4 },
        secondaryButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border },
        secondaryButtonText: { color: theme.colors.foreground, fontWeight: "600" },
        choice: { flexDirection: "row", alignItems: "center", gap: 10, padding: 11, borderRadius: 9, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface2 },
        choiceSelected: { borderColor: theme.colors.accent },
        choiceText: { color: theme.colors.foreground, flex: 1 },
        dangerButton: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 9, backgroundColor: theme.colors.statusDanger },
        dangerText: { color: theme.colors.accentForeground, fontWeight: "700" },
      }),
    [layout.compact, theme],
  );

  function toggleGroup(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openProject(project: Project) {
    if (!navigation) {
      toast.error("This Paseo client cannot open workspaces from plugin surfaces");
      return;
    }
    try {
      const candidates = workspaces
        .filter(({ projectId }) => projectId === project.projectId)
        .sort((a, b) => STATUS_PRIORITY.indexOf(a.status) - STATUS_PRIORITY.indexOf(b.status));
      if (candidates[0]) {
        navigation.openWorkspace({ workspaceId: candidates[0].id });
        return;
      }
      const workspace = await paseo.workspaces.open(project.projectRootPath);
      navigation.openWorkspace({ workspaceId: workspace.id });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to open project");
    }
  }

  function renderProject(project: Project) {
    const status = projectStatus(project.projectId, workspaces);
    const activeCount = workspaces.filter(({ projectId }) => projectId === project.projectId).length;
    return (
      <View key={project.projectId} style={styles.projectRow}>
        <Pressable
          accessibilityLabel={`Open ${project.projectDisplayName}`}
          onPress={() => void openProject(project)}
          style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 11, opacity: pressed ? 0.7 : 1 }]}
        >
          <IdentityIcon name={project.projectDisplayName} icon={null} status={status} size={30} theme={theme} />
          <View style={styles.projectText}>
            <Text numberOfLines={1} style={styles.projectName}>{project.projectDisplayName}</Text>
            <Text numberOfLines={1} style={styles.projectPath}>
              {activeCount ? `${activeCount} active workspace${activeCount === 1 ? "" : "s"}` : project.projectRootPath}
            </Text>
          </View>
        </Pressable>
        <Pressable accessibilityLabel={`Move ${project.projectDisplayName} to a group`} onPress={() => setMovingProject(project)} style={styles.iconButton}>
          <Icon name="FolderInput" size={18} color={theme.colors.foregroundMuted} />
        </Pressable>
      </View>
    );
  }

  function renderGroup(group: ProjectGroup, members: Project[], synthetic = false) {
    const isCollapsed = collapsed.has(group.id);
    const status = aggregateStatus(members.map(({ projectId }) => projectStatus(projectId, workspaces)).filter((value): value is StatusBucket => value !== null));
    return (
      <View key={group.id} style={styles.card}>
        <View style={styles.groupHeader}>
          <Pressable accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${group.name}`} onPress={() => toggleGroup(group.id)} style={({ pressed }) => [{ flex: 1, flexDirection: "row", alignItems: "center", gap: 11, opacity: pressed ? 0.7 : 1 }]}>
            <IdentityIcon name={group.name} icon={group.icon} status={status} size={36} theme={theme} />
            <Icon name={isCollapsed ? "ChevronRight" : "ChevronDown"} size={17} color={theme.colors.foregroundMuted} />
            <Text numberOfLines={1} style={styles.groupName}>{group.name}</Text>
            <Text style={styles.count}>{members.length}</Text>
          </Pressable>
          {!synthetic && (
            <>
              <Pressable accessibilityLabel={`Edit ${group.name}`} onPress={() => setEditingGroup(group)} style={styles.iconButton}>
                <Icon name="Pencil" size={17} color={theme.colors.foregroundMuted} />
              </Pressable>
              <Pressable accessibilityLabel={`Delete ${group.name}`} onPress={() => setDeletingGroup(group)} style={styles.iconButton}>
                <Icon name="Trash2" size={17} color={theme.colors.statusDanger} />
              </Pressable>
            </>
          )}
        </View>
        {!isCollapsed && (
          <View style={styles.projects}>
            {members.length ? members.map(renderProject) : <Text style={styles.empty}>No projects in this group</Text>}
          </View>
        )}
      </View>
    );
  }

  const loading = groupsQuery.isLoading || projectsQuery.isLoading || workspacesQuery.isLoading;
  const error = groupsQuery.error || projectsQuery.error || workspacesQuery.error;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Project groups</Text>
            <Text style={styles.subtitle}>Organize projects without changing their folders on disk.</Text>
          </View>
          <Pressable accessibilityLabel="Create group" onPress={() => setEditingGroup("new")} style={styles.primaryButton}>
            <Icon name="FolderPlus" size={18} color={theme.colors.accentForeground} />
            {!layout.compact && <Text style={styles.primaryButtonText}>New group</Text>}
          </Pressable>
        </View>
        {loading && <ActivityIndicator color={theme.colors.accent} />}
        {error && <Text style={styles.error}>{error instanceof Error ? error.message : "Unable to load project groups"}</Text>}
        {groups.map((group) => renderGroup(group, projects.filter(({ projectId }) => group.projectIds.includes(projectId))))}
        {renderGroup({ id: "__ungrouped__", name: "Ungrouped", icon: null, projectIds: [] }, ungrouped, true)}
      </ScrollView>

      <GroupEditor
        group={editingGroup}
        pending={mutation.isPending}
        styles={styles}
        theme={theme}
        onClose={() => setEditingGroup(null)}
        onSave={(name, icon) => {
          const action = editingGroup === "new"
            ? { kind: "create" as const, name, icon }
            : editingGroup
              ? { kind: "update" as const, id: editingGroup.id, name, icon }
              : null;
          if (!action) return;
          mutation.mutate(action, { onSuccess: () => setEditingGroup(null) });
        }}
      />

      <AssignmentModal
        project={movingProject}
        groups={groups}
        pending={mutation.isPending}
        styles={styles}
        theme={theme}
        onClose={() => setMovingProject(null)}
        onChoose={(groupId) => {
          if (!movingProject) return;
          mutation.mutate(
            { kind: "assign", projectId: movingProject.projectId, groupId },
            { onSuccess: () => setMovingProject(null) },
          );
        }}
      />

      <Modal title="Delete group" open={deletingGroup !== null} onOpenChange={(open) => !open && setDeletingGroup(null)}>
        <Modal.Content>
          <View style={styles.modalBody}>
            <Text style={{ color: theme.colors.foreground }}>
              Delete “{deletingGroup?.name}”? Its projects will return to Ungrouped.
            </Text>
            <View style={styles.modalActions}>
              <Pressable onPress={() => setDeletingGroup(null)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={mutation.isPending}
                onPress={() => deletingGroup && mutation.mutate({ kind: "delete", id: deletingGroup.id }, { onSuccess: () => setDeletingGroup(null) })}
                style={styles.dangerButton}
              >
                <Text style={styles.dangerText}>Delete</Text>
              </Pressable>
            </View>
          </View>
        </Modal.Content>
      </Modal>
    </View>
  );
}

type SurfaceStyles = ReturnType<typeof StyleSheet.create>;

function GroupEditor({
  group,
  pending,
  styles,
  theme,
  onClose,
  onSave,
}: {
  group: ProjectGroup | "new" | null;
  pending: boolean;
  styles: SurfaceStyles;
  theme: PluginSurfaceProps["theme"];
  onClose: () => void;
  onSave: (name: string, icon: string | null) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  useEffect(() => {
    setName(group && group !== "new" ? group.name : "");
    setIcon(group && group !== "new" ? group.icon ?? "" : "");
  }, [group]);
  const valid = name.trim().length > 0;
  return (
    <Modal title={group === "new" ? "New project group" : "Edit project group"} open={group !== null} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <View style={styles.modalBody}>
          <View>
            <Text style={styles.label}>Name</Text>
            <TextInput autoFocus maxLength={80} onChangeText={setName} placeholder="Client work" placeholderTextColor={theme.colors.foregroundMuted} style={styles.input} value={name} />
          </View>
          <View>
            <Text style={styles.label}>Icon (optional)</Text>
            <TextInput autoCapitalize="none" maxLength={2048} onChangeText={setIcon} placeholder="Emoji or https://… image URL" placeholderTextColor={theme.colors.foregroundMuted} style={styles.input} value={icon} />
            <Text style={styles.hint}>Leave blank to use the group’s first letter.</Text>
          </View>
          <View style={styles.modalActions}>
            <Pressable onPress={onClose} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable>
            <Pressable disabled={!valid || pending} onPress={() => onSave(name.trim(), icon.trim() || null)} style={[styles.primaryButton, (!valid || pending) && { opacity: 0.5 }]}>
              <Text style={styles.primaryButtonText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </Modal.Content>
    </Modal>
  );
}

function AssignmentModal({
  project,
  groups,
  pending,
  styles,
  theme,
  onClose,
  onChoose,
}: {
  project: Project | null;
  groups: ProjectGroup[];
  pending: boolean;
  styles: SurfaceStyles;
  theme: PluginSurfaceProps["theme"];
  onClose: () => void;
  onChoose: (groupId: string | null) => void;
}) {
  const currentGroupId = project ? groups.find(({ projectIds }) => projectIds.includes(project.projectId))?.id ?? null : null;
  const choices: Array<{ id: string | null; name: string; icon: string | null }> = [
    ...groups.map(({ id, name, icon }) => ({ id, name, icon })),
    { id: null, name: "Ungrouped", icon: null },
  ];
  return (
    <Modal title={project ? `Move ${project.projectDisplayName}` : "Move project"} open={project !== null} onOpenChange={(open) => !open && onClose()}>
      <Modal.Content>
        <ScrollView contentContainerStyle={styles.modalBody}>
          {choices.map((choice) => {
            const selected = choice.id === currentGroupId;
            return (
              <Pressable key={choice.id ?? "ungrouped"} disabled={pending} onPress={() => onChoose(choice.id)} style={[styles.choice, selected && styles.choiceSelected]}>
                <IdentityIcon name={choice.name} icon={choice.icon} status={null} size={28} theme={theme} />
                <Text style={styles.choiceText}>{choice.name}</Text>
                {selected && <Icon name="Check" size={18} color={theme.colors.accent} />}
              </Pressable>
            );
          })}
        </ScrollView>
      </Modal.Content>
    </Modal>
  );
}
