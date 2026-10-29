// Every action the app offers, by id. Menus, keybindings, the empty-editor list and
// (later) the command palette refer to commands by id, never by position or label.
export interface Command {
  // "area.action", e.g. "file.save".
  id: string;
  label: string;
  run: () => unknown;
}

const registry = new Map<string, Command>();

// Registering an id again replaces it (hot reload does this).
export function registerCommands(commands: Command[]): void {
  for (const command of commands) registry.set(command.id, command);
}

export function getCommand(id: string): Command | undefined {
  return registry.get(id);
}

export function allCommands(): Command[] {
  return [...registry.values()];
}
