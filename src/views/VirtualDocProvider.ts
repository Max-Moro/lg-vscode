/**
 * Простые виртуальные документы: lg://listing/... и lg://context/...
 * Позволяют отображать результат генерации без записи файлов на диск.
 */
import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

export class VirtualDocProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>();
  private emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? "Empty";
  }

  /** Заменяет небезопасные символы для имён файлов на '-' и вычищает повторения. */
  private sanitizeFileName(name: string): string {
    // Запрещённые для Windows и кросс-платформенные: / \ : " * ? < > | и управляющие
    const replaced = name.replace(/[\/\\:"*?<>|\u0000-\u001F]+/g, "-");
    // Сжать пробелы/дефисы
    return replaced.replace(/\s{2,}/g, " ").trim();
  }

  async open(kind: "listing" | "context" | "doctor", name: string, content: string) {
    const cfg = vscode.workspace.getConfiguration();
    const editable = cfg.get<boolean>("lg.openAsEditable") ?? false;

    if (editable) {
      const tmpDir = path.join(os.tmpdir(), "vscode-lg");
      fs.mkdirSync(tmpDir, { recursive: true });
      // ВАЖНО: не допускаем '/' в имени файла → санитизируем
      const safeName = this.sanitizeFileName(name.endsWith(".md") ? name : `${name}.md`);
      const filePath = path.join(tmpDir, safeName);
      fs.writeFileSync(filePath, content, "utf8");
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    }

    // старый режим: виртуальный read-only документ
    const uri = vscode.Uri.parse(`lg://${kind}/${encodeURIComponent(name)}`);
    this.cache.set(uri.toString(), content);
    this.emitter.fire(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}
