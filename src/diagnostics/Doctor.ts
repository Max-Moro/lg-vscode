/**
 * "Doctor" — быстрые проверки среды.
 * Сейчас: проверяем workspace + наличие lg-cfg/, даем подсказки.
 * Позже: версию схемы, наличие Python/tiktoken, git и т. п.
 */
import * as vscode from "vscode";
import { runDoctorJson } from "../runner/LgLocator";
import { getVirtualProvider } from "../views/virtualBus";

export async function runDoctor(ctx: vscode.ExtensionContext) {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showErrorMessage("Open a folder to run LG Doctor.");
    return;
  }
  try {
    const data = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "LG: Running Doctor…", cancellable: false },
      async () => runDoctorJson()
    );
    // Сформируем Markdown сами (как строку) — и откроем через VirtualDocProvider.
    const lines: string[] = [];
    lines.push(`# Listing Generator — Doctor Report\n`);
    lines.push(`- Version: \`${data.tool_version ?? "unknown"}\``);
    lines.push(`- Protocol: \`${data.protocol}\``);
    lines.push(`- Workspace root: \`${data.root}\``);
    lines.push(`\n## Checks\n`);
    for (const c of data.checks || []) {
      const mark = c.ok ? "✔" : "✖";
      const details = c.details ? ` — ${c.details}` : "";
      lines.push(`- ${mark} \`${c.name}\`${details}`);
    }
    const content = lines.join("\n");
    const vp = getVirtualProvider();
    if (vp) {
      // откроем как read-only виртуальный документ: не Untitled, не dirty
      await vp.open("doctor", "Doctor Report.md", content);
    } else {
      // запасной вариант (на всякий случай)
      const doc = await vscode.workspace.openTextDocument({ language: "markdown", content });
      await vscode.window.showTextDocument(doc, { preview: false });
    }
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG Doctor failed: ${e?.message || e}`);
  }
}
