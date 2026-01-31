/**
 * Theme Watcher for VS Code color theme changes
 */

import * as vscode from "vscode";
import { logDebug } from "../../logging/log";

type ThemeListener = (kind: vscode.ColorThemeKind) => void;

/**
 * Watches VS Code theme changes and notifies listeners
 */
export class ThemeWatcher implements vscode.Disposable {
  private listeners = new Set<ThemeListener>();
  private disposable?: vscode.Disposable;

  /**
   * Start watching theme changes
   */
  start(): void {
    this.disposable = vscode.window.onDidChangeActiveColorTheme((theme) => {
      logDebug(`[ThemeWatcher] Theme changed to kind: ${theme.kind}`);
      this.notifyListeners(theme.kind);
    });
    logDebug("[ThemeWatcher] Started");
  }

  /**
   * Get current theme kind
   */
  getCurrentTheme(): vscode.ColorThemeKind {
    return vscode.window.activeColorTheme.kind;
  }

  /**
   * Subscribe to theme changes
   */
  subscribe(listener: ThemeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(kind: vscode.ColorThemeKind): void {
    for (const listener of this.listeners) {
      try {
        listener(kind);
      } catch (e) {
        logDebug(`[ThemeWatcher] Listener error: ${e}`);
      }
    }
  }

  dispose(): void {
    this.disposable?.dispose();
    this.listeners.clear();
    logDebug("[ThemeWatcher] Disposed");
  }
}
