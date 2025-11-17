import * as vscode from "vscode";
import * as fs from "fs";
import { EXT_ID } from "../constants";

/** Returns the extension URI (by EXT_ID). */
export function getExtensionUri(): vscode.Uri {
  const ext = vscode.extensions.getExtension(EXT_ID);
  if (!ext) throw new Error(`Cannot resolve extension URI (${EXT_ID}).`);
  return ext.extensionUri;
}

/** Generates CSP nonce. */
export function makeNonce(len = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

/** Converts a relative path inside the `media/` folder to a webview-URI. */
export function mediaUri(webview: vscode.Webview, relPath: string): string {
  const base = vscode.Uri.joinPath(getExtensionUri(), "media", relPath);
  return webview.asWebviewUri(base).toString();
}

/** Converts an absolute file path (e.g., from node_modules) to a webview-URI. */
export function toWebviewUri(webview: vscode.Webview, absFsPath: string): string {
  return webview.asWebviewUri(vscode.Uri.file(absFsPath)).toString();
}

/** Reads an HTML template from `media/` by relative path. */
export function readHtmlTemplate(relPathInMedia: string): string {
  const file = vscode.Uri.joinPath(getExtensionUri(), "media", relPathInMedia);
  return fs.readFileSync(file.fsPath, "utf8");
}

/**
 * Converts a file from the `media/ui/dist/` folder to a webview-URI.
 */
export function lgUiUri(webview: vscode.Webview, file: 'lg-ui.css' | 'lg-ui.js'): string {
  const base = vscode.Uri.joinPath(getExtensionUri(), 'media', 'ui', 'dist', file);
  return webview.asWebviewUri(base).toString();
}

/**
 * Builds HTML from a template `media/<template>` with auto-substitution of {{cspSource}} and {{nonce}}.
 * In `replacements` you can pass additional markers ({{key}} → value).
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
