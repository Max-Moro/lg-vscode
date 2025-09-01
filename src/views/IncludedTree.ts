/**
 * Боковая панель со списком «включённых путей».
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
    // Если VS Code спрашивает детей у конкретной папки — отдаём их.
    if (element && (element as any).__children) {
      return (element as any).__children as vscode.TreeItem[];
    }
    // Иначе — корневой список.
    return this.items;
  }

  toggleViewMode() {
    this.viewMode = this.viewMode === "flat" ? "tree" : "flat";
    this.memento?.update(STATE_KEY, this.viewMode).then(undefined, () => void 0);
    // Перестроим
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
    // Оставляем resourceUri — VS Code сам подставит иконки по типу файла.
    this.resourceUri = uri;
    this.contextValue = "lg.path";
    // Не задаём iconPath для файлов, чтобы не сломать авто-иконки.
    // (Для папок iconPath остаётся в FolderItem.)
  }
}

class FolderItem extends vscode.TreeItem {
  constructor(name: string, children: vscode.TreeItem[]) {
    super(name, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon("folder");
    // Вложенные элементы возвращаем через override `children` (ниже храним ссылку)
    (this as any).__children = children;
  }
}

function buildFlatItems(relPaths: string[]): vscode.TreeItem[] {
  // Плоский режим: показываем полный относительный путь как label.
  return relPaths.map((rel) => new PathItem(rel, rel, resolveRelPathToUri(rel)));
}

function buildTreeItems(relPaths: string[]): vscode.TreeItem[] {
  // Строим простое дерево по сегментам POSIX-пути (CLI отдаёт POSIX).
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
        ...toItems(child), // сначала подпапки
        ...child.files
          .slice()
          .sort((a, b) => a.localeCompare(b))
          .map((rel) => {
            // Древовидный режим: label — только basename (последний сегмент POSIX-пути)
            const parts = rel.split("/");
            const base = parts.length ? parts[parts.length - 1] : rel;
            return new PathItem(base, rel, resolveRelPathToUri(rel));
          }),
      ];
      folderItems.push(new FolderItem(child.name, children));
    }
    return folderItems;
  };

  // Верхний уровень: папки + файлы верхнего уровня
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
