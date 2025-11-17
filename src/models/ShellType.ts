/**
 * Types of terminal shells
 */
export type ShellType = "bash" | "zsh" | "sh" | "powershell" | "cmd";

/**
 * Description of shell for UI
 */
export interface ShellDescriptor {
  id: ShellType;
  label: string;
}

/**
 * Get default shell for current platform
 */
export function getDefaultShell(): ShellType {
  const platform = process.platform;
  if (platform === "win32") {
    return "powershell";
  } else if (platform === "darwin") {
    return "zsh";
  } else {
    return "bash";
  }
}

/**
 * Get list of available shells for current platform
 */
export function getAvailableShells(): ShellDescriptor[] {
  const platform = process.platform;
  
  if (platform === "win32") {
    return [
      { id: "powershell", label: "PowerShell" },
      { id: "cmd", label: "Command Prompt" },
      { id: "bash", label: "Bash (WSL/Git Bash)" }
    ];
  } else if (platform === "darwin") {
    return [
      { id: "zsh", label: "Zsh" },
      { id: "bash", label: "Bash" }
    ];
  } else {
    return [
      { id: "bash", label: "Bash" },
      { id: "zsh", label: "Zsh" },
      { id: "sh", label: "Sh" }
    ];
  }
}

