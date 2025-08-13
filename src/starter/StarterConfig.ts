/**
 * Создаем минимальный lg-cfg/ с примером шаблона.
 * Это полезно, чтобы пользователь мог сразу «пощупать» UX.
 */
import * as vscode from "vscode";
import { effectiveWorkspaceRoot } from "../runner/LgLocator";

export async function ensureStarterConfig() {
  const rootFs = effectiveWorkspaceRoot();
  if (!rootFs) {
    vscode.window.showErrorMessage("Open a folder to create starter config.");
    return;
  }
  const cfgDir = vscode.Uri.file(require("path").join(rootFs, "lg-cfg"));
  const ctxDir = vscode.Uri.joinPath(cfgDir, "contexts");
  const cfgFile = vscode.Uri.joinPath(cfgDir, "config.yaml");
  const tplFile = vscode.Uri.joinPath(ctxDir, "example.tpl.md");

  // mkdir -p
  await vscode.workspace.fs.createDirectory(ctxDir);

  // config.yaml
  const cfg = `schema_version: 5

docs-intro:
  extensions: [".md"]
  filters:
    mode: allow
    allow:
      - "/README.md"

all-src:
  extensions: [".py", ".ts", ".js", ".json", ".yaml", ".toml"]
`;

  // example.tpl.md
  const tpl = `\${docs-intro}

# Исходный код проекта
\${all-src}
`;

  await vscode.workspace.fs.writeFile(cfgFile, Buffer.from(cfg, "utf8"));
  await vscode.workspace.fs.writeFile(tplFile, Buffer.from(tpl, "utf8"));

  vscode.window.showInformationMessage("Starter config created: lg-cfg/config.yaml and contexts/example.tpl.md");
}
