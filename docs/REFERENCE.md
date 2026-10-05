# Paseo Project Groups

A native Paseo sidebar surface for organizing registered projects into named parent groups.
Grouping is metadata only: it never moves or renames directories on disk.

## Features

- Create, rename, and delete project groups.
- Move projects between groups or back to **Ungrouped**.
- Give a group an emoji or image URL; otherwise its icon uses the first letter of its name.
- Aggregate Paseo's live project status onto both project and group icons:
  - spinning accent indicator: an agent is working;
  - amber alert: an agent needs input;
  - green dot: completed work needs attention;
  - red dot: an agent failed.
- Open an existing project workspace by selecting its row, or create the project's local workspace
  when none is active.
- Use the same data from desktop, web, and mobile clients connected to the daemon.

Paseo's current plugin API cannot rearrange the built-in Projects sidebar. This plugin therefore
provides a separate **Project groups** sidebar item with the grouped view.

## Storage

Group metadata is stored on the daemon machine at:

```text
$PASEO_HOME/plugin-data/project-groups.json
```

When `PASEO_HOME` is unset, it defaults to `~/.paseo`. The file contains project IDs, group names,
and icon references only. It is written atomically with mode `0600`.

## Develop and install

Requires Paseo 0.7.x with plugins enabled.

```bash
npm install
npm run typecheck
paseo plugin install /absolute/path/to/paseo-project-groups
paseo plugin ls
```

After editing:

```bash
npm run typecheck
paseo plugin reload project-groups
```
