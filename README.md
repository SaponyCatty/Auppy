# Auppy

Auppy is an offline command center for writing, organizing, and running Python automation commands from a friendly desktop interface. It is built for semi-technical users who want the power of Python scripts without needing to open an IDE, manage terminals, or remember command-line steps every time.

## Goal

The goal of Auppy is to make personal automation easier to control:

- Keep Python commands in one local library.
- Organize commands by workspace and optional folders.
- Run commands manually when the user chooses.
- Allow trusted commands to run automatically when the app opens.
- Show output, run history, safety warnings, and version history in one place.
- Stay offline and human-controlled, with no AI or cloud dependency in the current app design.

## Features

- Local Python command editor with syntax highlighting.
- Workspace and folder-based command library.
- Folderless commands for simple organization.
- Manual run, stop, duplicate, delete, and favorite actions.
- Optional run-on-app-start mode.
- Auto-save for edited commands.
- Version history and restore support.
- Run history with stdout, stderr, status, duration, and exit code.
- Live output monitoring while a command runs.
- Basic safety scan for destructive, shell, permission, and network patterns.
- Python interpreter detection and configurable default interpreter.
- Timeout and output-size limits per command.
- Import and export of the command library as JSON backups.
- Light and dark UI themes.
- Resizable left, editor, and monitoring panels.

## How To Use

1. Open Auppy.
2. Use the left directory panel to create a workspace if you want separate areas for different projects.
3. Create folders inside a workspace only when you need extra organization.
4. Click the new command button to create a command.
5. Rename the command from `Untitled` to something meaningful.
6. Write Python code in the central editor.
7. Choose the Python interpreter, timeout, output limit, workspace, folder, and tags.
8. Keep `Enabled` on if the command should be runnable.
9. Turn on `Trusted` only after reviewing what the command does.
10. Turn on `Run on app start` only for commands that are safe to run automatically.
11. Click Run to execute the command manually.
12. Watch output and history in the Monitoring panel.
13. Use Export to back up the local library, and Import to restore or transfer commands.

## Development

Install dependencies:

```bash
pnpm install
```

Run the frontend dev server:

```bash
pnpm dev
```

Run the Tauri app:

```bash
pnpm tauri dev
```

Build the frontend:

```bash
pnpm build
```

Check the Rust backend:

```bash
cd src-tauri
cargo check
```
