/**
 * File Watcher for lg-cfg/ directory changes
 *
 * Uses content hash comparison to filter out false positives
 * from auto-save without real changes.
 */

import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import type { LGStateCoordinator } from "../state-lg";
import { effectiveWorkspaceRoot } from "../cli/CliResolver";
import { logDebug } from "../logging/log";
import { Refresh } from "../state-lg/domains/lifecycle";

/**
 * Watches lg-cfg/ directory and dispatches REFRESH on real changes.
 * Filters out false positives using content hash comparison.
 */
export class FileWatcher implements vscode.Disposable {
  private watcher?: vscode.FileSystemWatcher;
  private refreshTimer?: NodeJS.Timeout;
  private readonly debounceMs = 300;

  /** Cache of file content hashes to detect real changes */
  private contentHashes = new Map<string, string>();

  /** Pending changes during debounce window */
  private pendingChanges = new Set<string>();

  constructor(
    private readonly coordinator: LGStateCoordinator
  ) {}

  /**
   * Compute MD5 hash of file content
   */
  private computeHash(filePath: string): string | null {
    try {
      const content = fs.readFileSync(filePath);
      return crypto.createHash("md5").update(content).digest("hex");
    } catch {
      // File may not exist or be unreadable
      return null;
    }
  }

  /**
   * Check if file content has actually changed
   */
  private hasContentChanged(filePath: string): boolean {
    const newHash = this.computeHash(filePath);

    if (newHash === null) {
      // File unreadable - treat as changed to be safe
      this.contentHashes.delete(filePath);
      return true;
    }

    const oldHash = this.contentHashes.get(filePath);
    this.contentHashes.set(filePath, newHash);

    if (oldHash === undefined) {
      // First time seeing this file - treat as changed
      return true;
    }

    return oldHash !== newHash;
  }

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

    const scheduleRefresh = (reason: string) => {
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
      }
      this.refreshTimer = setTimeout(() => {
        if (this.pendingChanges.size > 0) {
          logDebug(`[FileWatcher] lg-cfg/ ${reason}, dispatching REFRESH`);
          void this.coordinator.dispatch(Refresh.create());
          this.pendingChanges.clear();
        }
        this.refreshTimer = undefined;
      }, this.debounceMs);
    };

    // Create: always a real change, add to hash cache
    this.watcher.onDidCreate((uri) => {
      const filePath = uri.fsPath;
      logDebug(`[FileWatcher] File created: ${path.basename(filePath)}`);
      this.computeHash(filePath); // Cache initial hash
      this.contentHashes.set(filePath, this.computeHash(filePath) ?? "");
      this.pendingChanges.add(filePath);
      scheduleRefresh("file created");
    });

    // Change: check if content actually changed
    this.watcher.onDidChange((uri) => {
      const filePath = uri.fsPath;
      if (this.hasContentChanged(filePath)) {
        logDebug(`[FileWatcher] File changed (real): ${path.basename(filePath)}`);
        this.pendingChanges.add(filePath);
        scheduleRefresh("file changed");
      } else {
        logDebug(`[FileWatcher] File changed (false positive, skipped): ${path.basename(filePath)}`);
      }
    });

    // Delete: always a real change, remove from hash cache
    this.watcher.onDidDelete((uri) => {
      const filePath = uri.fsPath;
      logDebug(`[FileWatcher] File deleted: ${path.basename(filePath)}`);
      this.contentHashes.delete(filePath);
      this.pendingChanges.add(filePath);
      scheduleRefresh("file deleted");
    });

    logDebug("[FileWatcher] Started watching lg-cfg/");
  }

  dispose(): void {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
    }
    this.watcher?.dispose();
    this.contentHashes.clear();
    this.pendingChanges.clear();
    logDebug("[FileWatcher] Disposed");
  }
}
