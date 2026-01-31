/**
 * Watcher Manager - Central management of all watchers
 */

import * as vscode from "vscode";
import type { StateCoordinator } from "../coordinator";
import { FileWatcher } from "./FileWatcher";
import { ThemeWatcher } from "./ThemeWatcher";
import { logDebug } from "../../logging/log";

/**
 * Manages all application watchers
 */
export class WatcherManager implements vscode.Disposable {
  public readonly fileWatcher: FileWatcher;
  public readonly themeWatcher: ThemeWatcher;

  constructor(coordinator: StateCoordinator) {
    this.fileWatcher = new FileWatcher(coordinator);
    this.themeWatcher = new ThemeWatcher();
    logDebug("[WatcherManager] Created");
  }

  /**
   * Start all watchers
   */
  startAll(): void {
    this.fileWatcher.start();
    this.themeWatcher.start();
    logDebug("[WatcherManager] All watchers started");
  }

  dispose(): void {
    this.fileWatcher.dispose();
    this.themeWatcher.dispose();
    logDebug("[WatcherManager] Disposed");
  }
}

export { FileWatcher } from "./FileWatcher";
export { ThemeWatcher } from "./ThemeWatcher";
