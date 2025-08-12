/**
 * Создаем минимальный lg-cfg/ с примером шаблона.
 * Это полезно, чтобы пользователь мог сразу «пощупать» UX.
 */
import * as vscode from "vscode";

export async function ensureStarterConfig() {
  const wf = vscode.workspace.workspaceFolders?.[0];
  if (!wf) {
    vscode.window.showErrorMessage("Open a folder to create starter config.");
    return;
  }
  const root = wf.uri;
  const cfgDir = vscode.Uri.joinPath(root, "lg-cfg");
  const ctxDir = vscode.Uri.joinPath(cfgDir, "contexts");
  const cfgFile = vscode.Uri.joinPath(cfgDir, "config.yaml");
  const tplFile = vscode.Uri.joinPath(ctxDir, "example.tpl.md");

  // mkdir -p
  await vscode.workspace.fs.createDirectory(ctxDir);

  // config.yaml
  const cfg = `schema_version: 5

all:
  extensions: [".py", ".md", ".yaml", ".json", ".toml"]
  code_fence: true
  markdown:
    max_heading_level: 3
  filters:
    mode: block
    block:
      - ".git/"
      - "**/__pycache__/**"
      - "**/*.pyc"
      - "**/*.log"

docs:
  extensions: [".md"]
  filters:
    mode: allow
    allow:
      - "/README.md"
`;

  // example.tpl.md
  const tpl = `Вводная часть проекта.

== Документация ==
\${tpl:docs/architecture}

== Исходники секции 'all' ==
\${all}
`;

  await vscode.workspace.fs.writeFile(cfgFile, Buffer.from(cfg, "utf8"));
  await vscode.workspace.fs.writeFile(tplFile, Buffer.from(tpl, "utf8"));

  vscode.window.showInformationMessage("Starter config created: lg-cfg/config.yaml and contexts/example.tpl.md");
}
