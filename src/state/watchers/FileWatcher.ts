/**
 * File Watcher for lg-cfg/ directory changes
 */

import * as vscode from "vscode";
import * as path from "path";
import type { StateCoordinator } from "../coordinator";
import { effectiveWorkspaceRoot } from "../../cli/CliResolver";
import { logDebug } from "../../logging/log";
import { Refresh } from "../domains/lifecycle";

/**
 * Watches lg-cfg/ directory and dispatches REFRESH on changes
 */
export class FileWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private refreshTimer?: NodeJS.Timeout;
  private readonly debounceMs = 300;

  constructor(
    private readonly coordinator: StateCoordinator
  ) {}

  /**
   * Start watching lg-cfg/ directory
   */
  start(): void {
    const root = effectiveWorkspaceRoot();
    if (!root) {
      logDebug("[FileWatcher] No workspace root, skipping");
      return;
    }

    const lgCfgUri = vscode.Uri.file(path.join(root, "lg-cfg"));
    const pattern = new vscode.RelativePattern(lgCfgUri, "**/*");

    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

    const scheduleRefresh = () => {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => {
        logDebug("[FileWatcher] lg-cfg/ changed, dispatching REFRESH");
        void this.coordinator.dispatch(Refresh.create());
        this.refreshTimer = undefined;
      }, this.debounceMs);
    };

    this.watcher.onDidCreate(scheduleRefresh);
    this.watcher.onDidChange(scheduleRefresh);
    this.watcher.onDidDelete(scheduleRefresh);

    logDebug("[FileWatcher] Started watching lg-cfg/");
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.watcher?.dispose();
    logDebug("[FileWatcher] Disposed");
  }
}
