import * as vscode from "vscode";
import * as fs from "fs";
import { EXT_ID } from "../constants";

/** Возвращает URI расширения (по EXT_ID). */
export function getExtensionUri(): vscode.Uri {
  const ext = vscode.extensions.getExtension(EXT_ID);
  if (!ext) throw new Error(`Cannot resolve extension URI (${EXT_ID}).`);
  return ext.extensionUri;
}

/** Генерирует CSP nonce. */
export function makeNonce(len = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/** Конвертирует относительный путь внутри папки `media/` в webview-URI. */
export function mediaUri(webview: vscode.Webview, relPath: string): string {
  const base = vscode.Uri.joinPath(getExtensionUri(), "media", relPath);
  return webview.asWebviewUri(base).toString();
}

/** Конвертирует абсолютный файловый путь (например из node_modules) в webview-URI. */
export function toWebviewUri(webview: vscode.Webview, absFsPath: string): string {
  return webview.asWebviewUri(vscode.Uri.file(absFsPath)).toString();
}

/** Читает HTML-шаблон из `media/` по относительному пути. */
export function readHtmlTemplate(relPathInMedia: string): string {
  const file = vscode.Uri.joinPath(getExtensionUri(), "media", relPathInMedia);
  return fs.readFileSync(file.fsPath, "utf8");
}

/**
 * Собирает HTML из шаблона `media/<template>` с автоподстановкой {{cspSource}} и {{nonce}}.
 * В `replacements` можно передать дополнительные маркеры ({{key}} → value).
 */
export function buildHtml(
  webview: vscode.Webview,
  templateRelPath: string,
  replacements: Record<string, string> = {}
): string {
  const nonce = makeNonce();
  let html = readHtmlTemplate(templateRelPath)
    .replace(/{{cspSource}}/g, webview.cspSource)
    .replace(/{{nonce}}/g, nonce);
  for (const [k, v] of Object.entries(replacements)) {
    const re = new RegExp(escapeRegExp(`{{${k}}}`), "g");
    html = html.replace(re, v);
  }
  return html;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
