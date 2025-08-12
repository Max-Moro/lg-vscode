/**
 * "Doctor" — быстрые проверки среды.
 * Сейчас: проверяем workspace + наличие lg-cfg/, даем подсказки.
 * Позже: версию схемы, наличие Python/tiktoken, git и т. п.
 */
import * as vscode from "vscode";
import { runDoctorJson } from "../runner/LgLocator";

export async function runDoctor(ctx: vscode.ExtensionContext) {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showErrorMessage("Open a folder to run LG Doctor.");
    return;
  }
  try {
    const data = await runDoctorJson();
    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.appendMarkdown(`**Listing Generator** — version: \`${data.version}\`, protocol: \`${data.protocol}\`\n\n`);
    md.appendMarkdown(`**Workspace root**: \`${data.root}\`\n\n`);
    md.appendMarkdown(`### Checks\n`);
    for (const c of data.checks || []) {
      const mark = c.ok ? "✔" : "✖";
      const details = c.details ? ` — ${c.details}` : "";
      md.appendMarkdown(`- ${mark} \`${c.name}\`${details}\n`);
    }
    await vscode.window.showInformationMessage("LG Doctor finished. Opening report…");
    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: md.value });
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG Doctor failed: ${e?.message || e}`);
  }
}
