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
  const path = require("path");
  const cfgDir = vscode.Uri.file(path.join(rootFs, "lg-cfg"));
  const cfgFile = vscode.Uri.joinPath(cfgDir, "sections.yaml");
  const tplFile = vscode.Uri.joinPath(cfgDir, "example.tpl.md");
  const ctxFile = vscode.Uri.joinPath(cfgDir, "example.ctx.md");

  // mkdir -p
  await vscode.workspace.fs.createDirectory(cfgDir);

  // sections.yaml
  const cfg = `schema_version: 6

docs-intro:
  extensions: [".md"]
  filters:
    mode: allow
    allow:
      - "/README.md"

all-src:
  extensions: [".py", ".ts", ".js", ".json", ".yaml", ".toml"]
`;

  // example.tpl.md (вставляемый шаблон)
  const tpl = `# Intro
\${docs-intro}

# Исходный код проекта
\${all-src}
`;

  // example.ctx.md (контекст верхнего уровня)
  const ctx = `# Demo Context
\${tpl:example}
`;

  await vscode.workspace.fs.writeFile(cfgFile, Buffer.from(cfg, "utf8"));
  await vscode.workspace.fs.writeFile(tplFile, Buffer.from(tpl, "utf8"));
  await vscode.workspace.fs.writeFile(ctxFile, Buffer.from(ctx, "utf8"));

  vscode.window.showInformationMessage("Starter created: lg-cfg/sections.yaml, example.tpl.md, example.ctx.md");
}
