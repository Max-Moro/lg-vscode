/**
 * Bootstrap Layer - Centralized initialization for all singletons and services.
 *
 * Call bootstrap(context) once in extension.ts activate().
 * After that, use getXXX() functions to access singletons.
 */
import * as vscode from "vscode";
import { setContext, getContext, clearContext } from "./context";
import { initLogging, logDebug, logInfo } from "../logging/log";
import { PCEStateStore } from "../state/store";
import { StateCoordinator } from "../state/coordinator";
import { ActionDispatcher } from "../actions";
import { WatcherManager } from "../state/watchers";
import { StatsService } from "../services/StatsService";
import { GenerationService } from "../services/GenerationService";
import { GitService } from "../services/GitService";
import { AiIntegrationService, createAiIntegrationService } from "../services/ai";
// noinspection ES6PreferShortImport — import via domains/index.ts triggers side-effect rule registration
import { getAllRules } from "../state/domains";
import { VirtualDocProvider } from "../views/VirtualDocProvider";
import { IncludedTree } from "../views/IncludedTree";

// Singleton registry
let _store: PCEStateStore | undefined;
let _coordinator: StateCoordinator | undefined;
let _dispatcher: ActionDispatcher | undefined;
let _watchers: WatcherManager | undefined;
let _aiService: AiIntegrationService | undefined;
let _gitService: GitService | undefined;
let _statsService: StatsService | undefined;
let _generationService: GenerationService | undefined;
let _vdocs: VirtualDocProvider | undefined;
let _includedTree: IncludedTree | undefined;
let _bootstrapped = false;

/**
 * Result of bootstrap containing view components that need registration.
 */
export interface BootstrapResult {
  vdocs: VirtualDocProvider;
  includedTree: IncludedTree;
}

/**
 * Initialize all singletons and services.
 * Must be called once in extension.ts activate().
 *
 * @throws Error if already bootstrapped
 */
export function bootstrap(context: vscode.ExtensionContext): BootstrapResult {
  if (_bootstrapped) {
    throw new Error("Extension already bootstrapped");
  }

  // 1. Context first (enables getContext(), getWorkspaceState(), etc.)
  setContext(context);

  // 2. Logging (needs context for config subscription)
  initLogging(context);
  logInfo("Bootstrap started");

  // 3. Services that need context directly
  _aiService = createAiIntegrationService();
  _gitService = new GitService();

  // 4. State management
  _store = PCEStateStore.createInstance(context.workspaceState);
  _coordinator = new StateCoordinator(_store);
  _coordinator.setRules(getAllRules());

  // 6. Watchers
  _watchers = new WatcherManager(_coordinator);

  // 7. View components
  _vdocs = new VirtualDocProvider();
  _includedTree = new IncludedTree(getContext().workspaceState);

  // 8. Services (use getStore() internally)
  _statsService = new StatsService();
  _generationService = new GenerationService();

  // 9. Action dispatcher (no deps needed - actions use getters directly)
  _dispatcher = new ActionDispatcher();

  _bootstrapped = true;
  logDebug("Bootstrap completed");

  return { vdocs: _vdocs, includedTree: _includedTree };
}

// ========== Singleton Getters ==========

function assertBootstrapped(name: string): void {
  if (!_bootstrapped) {
    throw new Error(`${name} not available - call bootstrap() first`);
  }
}

export function getStore(): PCEStateStore {
  assertBootstrapped("PCEStateStore");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _store!;
}

export function getCoordinator(): StateCoordinator {
  assertBootstrapped("StateCoordinator");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _coordinator!;
}

export function getDispatcher(): ActionDispatcher {
  assertBootstrapped("ActionDispatcher");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _dispatcher!;
}

export function getWatchers(): WatcherManager {
  assertBootstrapped("WatcherManager");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _watchers!;
}

export function getAiService(): AiIntegrationService {
  assertBootstrapped("AiIntegrationService");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _aiService!;
}

export function getGitService(): GitService {
  assertBootstrapped("GitService");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _gitService!;
}

export function getStatsService(): StatsService {
  assertBootstrapped("StatsService");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _statsService!;
}

export function getGenerationService(): GenerationService {
  assertBootstrapped("GenerationService");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _generationService!;
}

export function getVdocs(): VirtualDocProvider {
  assertBootstrapped("VirtualDocProvider");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _vdocs!;
}

export function getIncludedTree(): IncludedTree {
  assertBootstrapped("IncludedTree");
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  return _includedTree!;
}

/**
 * Shutdown all singletons and release resources.
 * Must be called in extension.ts deactivate().
 *
 * Safe to call multiple times or when not bootstrapped.
 */
export function shutdown(): void {
  if (!_bootstrapped) {
    return;
  }

  logInfo("Shutdown started");

  // Dispose watchers (file system, theme subscriptions)
  _watchers?.dispose();

  // Dispose view components
  _vdocs?.dispose();
  // Note: _includedTree is a TreeDataProvider, VS Code manages its lifecycle

  // Reset all singletons
  _store = undefined;
  _coordinator = undefined;
  _dispatcher = undefined;
  _watchers = undefined;
  _aiService = undefined;
  _gitService = undefined;
  _statsService = undefined;
  _generationService = undefined;
  _vdocs = undefined;
  _includedTree = undefined;

  // Clear extension context
  clearContext();

  _bootstrapped = false;

  logDebug("Shutdown completed");
}

// Re-export context utilities
export { getContext } from "./context";
