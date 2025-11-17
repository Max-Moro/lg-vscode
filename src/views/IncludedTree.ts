/**
 * Sidebar panel with a list of "included paths".
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { effectiveWorkspaceRoot } from "../cli/CliResolver";

type ViewMode = "flat" | "tree";
const STATE_KEY = "lg.included.viewMode";

export class IncludedTree implements vscode.TreeDataProvider<vscode.TreeItem> {
  private items: vscode.TreeItem[] = [];
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private viewMode: ViewMode = "tree";
  private relPaths: string[] = [];
  private memento?: vscode.Memento;

  constructor(ctx?: vscode.ExtensionContext) {
    this.memento = ctx?.workspaceState;
    const saved = this.memento?.get<ViewMode>(STATE_KEY);
    if (saved === "flat" || saved === "tree") this.viewMode = saved;
  }

  setPaths(paths: string[]) {
    this.relPaths = paths.slice();
    this.items = this.viewMode === "flat"
      ? buildFlatItems(this.relPaths)
      : buildTreeItems(this.relPaths);
    this.emitter.fire();
  }

  getTreeItem(el: vscode.TreeItem): vscode.TreeItem { return el; }

  getChildren(element?: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem[]> {
    // If VS Code requests children for a specific folder, return them.
    if (element && (element as any).__children) {
      return (element as any).__children as vscode.TreeItem[];
    }
    // Otherwise, return the root list.
    return this.items;
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === "flat" ? "tree" : "flat";
    this.memento?.update(STATE_KEY, this.viewMode).then(undefined, () => void 0);
    // Rebuild
    this.setPaths(this.relPaths);
  }

  getMode(): ViewMode {
    return this.viewMode;
  }
}

class PathItem extends vscode.TreeItem {
  constructor(labelText: string, relPath: string, uri: vscode.Uri) {
    super(labelText, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: "Open File",
      command: "vscode.open",
      arguments: [uri],
    };
    // Keep resourceUri — VS Code will automatically apply icons based on file type.
    this.resourceUri = uri;
    this.contextValue = "lg.path";
    // Do not set iconPath for files to avoid breaking auto-icons.
    // (For folders, iconPath is set in FolderItem.)
  }
}

class FolderItem extends vscode.TreeItem {
  constructor(name: string, children: vscode.TreeItem[]) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("folder");
    // Return nested elements via override `children` (we store a reference below)
    (this as any).__children = children;
  }
}

function buildFlatItems(relPaths: string[]): vscode.TreeItem[] {
  // Flat mode: show the full relative path as label.
  return relPaths.map((rel) => new PathItem(rel, rel, resolveRelPathToUri(rel)));
}

function buildTreeItems(relPaths: string[]): vscode.TreeItem[] {
  // Build a simple tree from POSIX path segments (CLI returns POSIX format).
  type Node = { name: string; files: string[]; folders: Map<string, Node> };
  const root: Node = { name: "", files: [], folders: new Map() };

  for (const rel of relPaths) {
    const parts = rel.split("/").filter(Boolean);
    if (!parts.length) continue;
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const seg = parts[i];
      if (!node.folders.has(seg)) node.folders.set(seg, { name: seg, files: [], folders: new Map() });
      node = node.folders.get(seg)!;
    }
    node.files.push(rel);
  }

  const toItems = (node: Node): vscode.TreeItem[] => {
    const folderItems: vscode.TreeItem[] = [];
    for (const [_, child] of Array.from(node.folders.entries()).sort(([a], [b]) => a.localeCompare(b))) {
      const children = [
        ...toItems(child), // subfolders first
        ...child.files
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .map((rel) => {
            // Tree mode: label — only basename (last segment of POSIX path)
            const parts = rel.split("/");
            const base = parts.length ? parts[parts.length - 1] : rel;
            return new PathItem(base, rel, resolveRelPathToUri(rel));
          }),
      ];
      folderItems.push(new FolderItem(child.name, children));
    }
    return folderItems;
  };

  // Top level: folders + top-level files
  const top: vscode.TreeItem[] = toItems(root);
  top.push(
    ...root.files
      .slice()
      .sort((a, b) => a.localeCompare(b))
      .map((rel) => {
        const parts = rel.split("/");
        const base = parts.length ? parts[parts.length - 1] : rel;
        return new PathItem(base, rel, resolveRelPathToUri(rel));
      })
  );

  return top;
}

/**
 * Resolves a relative path (POSIX from CLI) to an absolute vscode.Uri.
 * Algorithm:
 *  1) Try relative to effectiveWorkspaceRoot() — the same root that CLI uses.
 *  2) If the file is not found there — try all workspaceFolders sequentially.
 *  3) Fallback: return the URI from step (1), even if the file doesn't exist (let VS Code report it correctly).
 */
function resolveRelPathToUri(relPosixPath: string): vscode.Uri {
  const relNative = path.normalize(relPosixPath); // normalize to current OS

  const root = effectiveWorkspaceRoot();
  if (root) {
    const abs = path.join(root, relNative);
    if (fs.existsSync(abs)) {
      return vscode.Uri.file(abs);
    }
  }

  // Fallback across all workspace folders
  const folders = vscode.workspace.workspaceFolders || [];
  for (const f of folders) {
    try {
      const abs = path.join(f.uri.fsPath, relNative);
      if (fs.existsSync(abs)) {
        return vscode.Uri.file(abs);
      }
    } catch {
      // ignore and try next root
    }
  }

  // Last resort: build from effectiveWorkspaceRoot (even if file doesn't exist — VS Code will show an appropriate error)
  const base = root || (folders[0]?.uri.fsPath ?? "");
  return vscode.Uri.file(path.join(base, relNative));
}
