/**
 * Боковая панель со списком «включённых путей».
 * Исправлено для multi-root workspace: открываем файлы по абсолютным URI.
 */
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { effectiveWorkspaceRoot } from "../runner/LgLocator";

export class IncludedTree implements vscode.TreeDataProvider<PathItem> {
  private items: PathItem[] = [];
  private emitter = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.emitter.event;

  setPaths(paths: string[]) {
    // Преобразуем относительные POSIX-пути (из CLI) в абсолютные URI.
    this.items = paths.map((rel) => {
      const uri = resolveRelPathToUri(rel);
      return new PathItem(rel, uri);
    });
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
  constructor(relPath: string, uri: vscode.Uri) {
    super(relPath, vscode.TreeItemCollapsibleState.None);
    this.command = {
      title: "Open File",
      command: "vscode.open",
      arguments: [uri],
    };
    this.resourceUri = uri; // позволяет VS Code показывать иконки по типу файла
    this.contextValue = "lg.path";
    this.iconPath = new vscode.ThemeIcon("file");
  }
}

/**
 * Разрешает относительный путь (POSIX из CLI) в абсолютный vscode.Uri.
 * Алгоритм:
 *  1) Пытаемся относительно effectiveWorkspaceRoot() — тот же корень, что использует CLI.
 *  2) Если файла там нет — пробуем последовательно все workspaceFolders.
 *  3) Фоллбек: возвращаем URI из шага (1), даже если файла нет (пусть VS Code сообщит корректно).
 */
function resolveRelPathToUri(relPosixPath: string): vscode.Uri {
  const relNative = path.normalize(relPosixPath); // нормализуем под текущую ОС

  const root = effectiveWorkspaceRoot();
  if (root) {
    const abs = path.join(root, relNative);
    if (fs.existsSync(abs)) {
      return vscode.Uri.file(abs);
    }
  }

  // Фоллбек по всем папкам мультиворкспейса
  const folders = vscode.workspace.workspaceFolders || [];
  for (const f of folders) {
    try {
      const abs = path.join(f.uri.fsPath, relNative);
      if (fs.existsSync(abs)) {
        return vscode.Uri.file(abs);
      }
    } catch {
      // игнорируем и пробуем следующий корень
    }
  }

  // Последний шанс: строим от effectiveWorkspaceRoot (даже если файла нет — VS Code покажет понятную ошибку)
  const base = root || (folders[0]?.uri.fsPath ?? "");
  return vscode.Uri.file(path.join(base, relNative));
}
