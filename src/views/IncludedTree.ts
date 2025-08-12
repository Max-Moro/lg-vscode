/**
 * Боковая панель со списком «включённых путей».
 * Пока наполняем вручную из команды; позже — из JSON-вывода CLI (--list-included --json).
 */
import * as vscode from "vscode";

export class IncludedTree implements vscode.TreeDataProvider<PathItem> {
  private items: PathItem[] = [];
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  setPaths(paths: string[]) {
    this.items = paths.map((p) => new PathItem(p));
    this.emitter.fire();
  }

  getTreeItem(el: PathItem): vscode.TreeItem {
    return el;
  }

  getChildren(): PathItem[] {
    return this.items;
  }
}

class PathItem extends vscode.TreeItem {
  constructor(relPath: string) {
    super(relPath, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: "Open File",
      command: "vscode.open",
      arguments: [vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, relPath)]
    };
    this.contextValue = "lg.path";
    this.iconPath = new vscode.ThemeIcon("file");
  }
}
