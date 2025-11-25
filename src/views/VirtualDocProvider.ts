/**
 * Simple virtual documents: lg://listing/... and lg://context/...
 * Allow displaying generation results without writing files to disk.
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

  /** Replaces unsafe characters for file names with '-' and cleans up duplicates. */
  private sanitizeFileName(name: string): string {
    // Prohibited for Windows and cross-platform: / \ : " * ? < > | and control characters
    // eslint-disable-next-line no-control-regex
    const replaced = name.replace(/[\\/:"*?<>|\u0000-\u001F]+/g, "-");
    // Compress spaces/dashes
    return replaced.replace(/\s{2,}/g, " ").trim();
  }

  async open(kind: "listing" | "context" | "doctor", name: string, content: string) {
    const cfg = vscode.workspace.getConfiguration();
    const editable = cfg.get<boolean>("lg.openAsEditable") ?? false;

    if (editable) {
      const tmpDir = path.join(os.tmpdir(), "vscode-lg");
      fs.mkdirSync(tmpDir, { recursive: true });
      // IMPORTANT: do not allow '/' in filename → sanitize
      const safeName = this.sanitizeFileName(name.endsWith(".md") ? name : `${name}.md`);
      const filePath = path.join(tmpDir, safeName);
      fs.writeFileSync(filePath, content, "utf8");
      const doc = await vscode.workspace.openTextDocument(filePath);
      await vscode.window.showTextDocument(doc, { preview: false });
      return;
    }

    // Legacy mode: virtual read-only document
    const uri = vscode.Uri.parse(`lg://${kind}/${encodeURIComponent(name)}`);
    this.cache.set(uri.toString(), content);
    this.emitter.fire(uri);
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  }
}
