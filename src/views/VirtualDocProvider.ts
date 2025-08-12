/**
 * Простые виртуальные документы: lg://listing/... и lg://context/...
 * Позволяют отображать результат генерации без записи файлов на диск.
 */
import * as vscode from "vscode";

export class VirtualDocProvider implements vscode.TextDocumentContentProvider {
  private cache = new Map<string, string>();
  private emitter = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.emitter.event;

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.cache.get(uri.toString()) ?? "Empty";
  }

  async open(kind: "listing" | "context" | "doctor", name: string, content: string) {
    const uri = vscode.Uri.parse(`lg://${kind}/${encodeURIComponent(name)}`);
    this.cache.set(uri.toString(), content);
    this.emitter.fire(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}
