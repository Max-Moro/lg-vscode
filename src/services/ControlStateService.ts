/**
 * Centralized service for managing the control panel state.
 *
 * Provides:
 * - Single point of access to state (workspace singleton)
 * - Logic for working with defaults and effective values
 * - Automatic state actualization on configuration changes
 * - State transformation for CLI commands
 */
import * as vscode from "vscode";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import { GitService } from "./GitService";
import { AiInteractionMode, parseAiInteractionMode } from "../models/AiInteractionMode";
import { type ShellType, getDefaultShell } from "../models/ShellType";
import { type ClaudeModel, getDefaultClaudeModel } from "../models/ClaudeModel";
import { type ClaudeIntegrationMethod, getDefaultClaudeMethod } from "../models/ClaudeIntegrationMethod";

/**
 * Control panel state model
 */
export interface ControlPanelState {
  section: string;
  template: string;
  tokenizerLib: string;
  encoder: string;
  ctxLimit: number;
  modes: Record<string, string>;      // modeSetId -> modeId
  tags: Record<string, string[]>;     // tagSetId -> [tagId, ...]
  taskText: string;
  targetBranch: string;

  // CLI-based AI provider settings
  cliScope: string;                   // Workspace scope (subdirectory) for CLI execution
  cliShell: ShellType;                // Terminal shell type
  claudeModel: ClaudeModel;           // Claude model (haiku, sonnet, opus)
  claudeIntegrationMethod: ClaudeIntegrationMethod; // Claude integration method (memory-file, session)
}

const STATE_KEY = "lg.control.state";

/**
 * Control panel state management service
 *
 * This service is a workspace singleton and provides centralized state management
 * for all extension components.
 */
export class ControlStateService {
  private static instance: ControlStateService | undefined;
  private gitService: GitService;
  
  /**
   * Event emitter for notifying about state changes.
   *
   * Used to synchronize state between different WebViews
   * (for example, between Control Panel and Stats WebView).
   *
   * How it works:
   * 1. When any component calls setState(), the service saves the changes
   * 2. Then the service notifies all subscribers through this event emitter
   * 3. Each subscriber can filter events by the _source field
   *    to avoid cyclic updates
   */
  private readonly _onDidChangeState = new vscode.EventEmitter<Partial<ControlPanelState> & { _source?: string }>();
  public readonly onDidChangeState = this._onDidChangeState.event;
  
  private constructor(
    private readonly context: vscode.ExtensionContext
  ) {
    this.gitService = new GitService();
  }
  
  /**
   * Get singleton instance of the service
   */
  public static getInstance(context: vscode.ExtensionContext): ControlStateService {
    if (!ControlStateService.instance) {
      ControlStateService.instance = new ControlStateService(context);
    }
    return ControlStateService.instance;
  }
  
  // ==================== Basic state operations ==================== //
  
  /**
   * Get current state from storage with automatic defaults applied.
   *
   * Ensures that critical fields (tokenizerLib, encoder, ctxLimit) always
   * have valid values, even on first run.
   *
   * @returns Partial<ControlPanelState> with defaults applied
   */
  public getState(): Partial<ControlPanelState> {
    const raw = this.context.workspaceState.get<Partial<ControlPanelState>>(STATE_KEY) || {};
    
    // Apply defaults for critical fields
    return {
      ...raw,
      tokenizerLib: raw.tokenizerLib || "tiktoken",
      encoder: raw.encoder || "cl100k_base",
      ctxLimit: raw.ctxLimit || 128000,
      cliShell: raw.cliShell || getDefaultShell(),
      claudeModel: raw.claudeModel || getDefaultClaudeModel(),
      claudeIntegrationMethod: raw.claudeIntegrationMethod || getDefaultClaudeMethod(),
    };
  }
  
  /**
   * Update state (partial merge)
   *
   * @param partial - partial state to update
   * @param source - source of change (to prevent cyclic updates)
   */
  public async setState(partial: Partial<ControlPanelState>, source?: string): Promise<void> {
    const current = this.getState();
    const next = { ...current, ...partial };
    await this.context.workspaceState.update(STATE_KEY, next);
    
    // Notify subscribers about state change
    // Pass source for filtering in subscribers
    this._onDidChangeState.fire({ ...partial, _source: source });
  }
  
  /**
   * Reset state to default values
   */
  public async resetState(): Promise<void> {
    await this.context.workspaceState.update(STATE_KEY, undefined);
  }
  

  // ==================== State actualization ==================== //
  
  /**
   * Actualize state based on available lists from CLI.
   * Removes outdated modes and tags that no longer exist in manifests.
   *
   * @param modeSets - list of mode sets from 'lg list mode-sets'
   * @param tagSets - list of tag sets from 'lg list tag-sets'
   * @returns true if state was changed
   */
  public async actualizeState(
    modeSets: ModeSetsList,
    tagSets: TagSetsList
  ): Promise<boolean> {
    const state = this.getState();
    let changed = false;
    
    // Actualize modes
    const modesResult = this.actualizeModes(state.modes || {}, modeSets);
    if (modesResult.changed) {
      const updated = { ...state, modes: modesResult.validatedModes };
      await this.context.workspaceState.update(STATE_KEY, updated);
      changed = true;
    }
    
    // Actualize tags
    const tagsResult = this.actualizeTags(state.tags || {}, tagSets);
    if (tagsResult.changed) {
      const currentState = this.getState(); // Re-read current state
      const updated = { ...currentState, tags: tagsResult.validatedTags };
      await this.context.workspaceState.update(STATE_KEY, updated);
      changed = true;
    }
    
    return changed;
  }
  
  /**
   * Actualize modes: remove non-existent sets and modes
   */
  private actualizeModes(
    currentModes: Record<string, string>,
    modeSets: ModeSetsList
  ): { validatedModes: Record<string, string>; changed: boolean } {
    const availableModeSetIds = new Set(modeSets["mode-sets"]?.map(ms => ms.id) || []);
    const validatedModes: Record<string, string> = {};
    
    for (const [modeSetId, modeId] of Object.entries(currentModes || {})) {
      if (availableModeSetIds.has(modeSetId)) {
        // Mode set exists - check if the specific mode exists
        const modeSet = modeSets["mode-sets"]?.find(ms => ms.id === modeSetId);
        const modeExists = modeSet?.modes?.some(m => m.id === modeId);

        if (modeExists) {
          validatedModes[modeSetId] = modeId;
        }
        // If mode doesn't exist, just don't add it (default will be selected in UI)
      }
      // If mode set doesn't exist, skip it (don't add to validatedModes)
    }
    
    // Check if there were changes
    const changed = 
      Object.keys(currentModes).length !== Object.keys(validatedModes).length ||
      Object.keys(currentModes).some(key => currentModes[key] !== validatedModes[key]);
    
    return { validatedModes, changed };
  }
  
  /**
   * Actualize tags: remove non-existent tag sets and tags
   */
  private actualizeTags(
    currentTags: Record<string, string[]>,
    tagSets: TagSetsList
  ): { validatedTags: Record<string, string[]>; changed: boolean } {
    const availableTagSetIds = new Set(tagSets["tag-sets"]?.map(ts => ts.id) || []);
    const tagSetToTags = new Map<string, Set<string>>();
    
    tagSets["tag-sets"]?.forEach(ts => {
      const tagIds = new Set(ts.tags?.map(t => t.id) || []);
      tagSetToTags.set(ts.id, tagIds);
    });
    
    const validatedTags: Record<string, string[]> = {};
    
    for (const [tagSetId, tagIds] of Object.entries(currentTags || {})) {
      // Check if tag set exists
      if (availableTagSetIds.has(tagSetId)) {
        const availableTagsInSet = tagSetToTags.get(tagSetId) || new Set();
        // Filter tags, keeping only those that exist in this set
        const validTagsInSet = tagIds.filter(tagId => availableTagsInSet.has(tagId));

        // Add to result only if valid tags remain
        if (validTagsInSet.length > 0) {
          validatedTags[tagSetId] = validTagsInSet;
        }
      }
      // If tag set doesn't exist, skip it entirely
    }
    
    // Compare structures to determine changes
    const changed = 
      Object.keys(currentTags).length !== Object.keys(validatedTags).length ||
      Object.keys(currentTags).some(key => {
        const curr = currentTags[key] || [];
        const valid = validatedTags[key] || [];
        return curr.length !== valid.length || curr.some((tag, i) => tag !== valid[i]);
      });
    
    return { validatedTags, changed };
  }
  
  /**
   * Validate and correct basic state parameters
   * (section, template, tokenizerLib)
   *
   * @param availableSections - available sections
   * @param availableContexts - available contexts (templates)
   * @param availableLibs - available tokenization libraries
   * @returns true if state was changed
   */
  public async validateBasicParams(
    availableSections: string[],
    availableContexts: string[],
    availableLibs: string[]
  ): Promise<boolean> {
    const state = this.getState();
    let changed = false;
    
    // Validate section
    if (state.section && !availableSections.includes(state.section) && availableSections.length > 0) {
      state.section = availableSections[0];
      changed = true;
    }
    
    // Validate template
    if (state.template && !availableContexts.includes(state.template) && availableContexts.length > 0) {
      state.template = availableContexts[0];
      changed = true;
    }
    
    // Validate tokenizerLib
    if (state.tokenizerLib && !availableLibs.includes(state.tokenizerLib) && availableLibs.length > 0) {
      state.tokenizerLib = availableLibs[0];
      changed = true;
    }
    
    if (changed) {
      await this.context.workspaceState.update(STATE_KEY, state);
    }
    
    return changed;
  }
  
  // ==================== Checking active modes ==================== //
  
  /**
   * Get current AI interaction mode.
   *
   * @returns Typed AI interaction mode
   */
  public getAiInteractionMode(): AiInteractionMode {
    const state = this.getState();
    const aiInteractionMode = state.modes?.["ai-interaction"];
    return parseAiInteractionMode(aiInteractionMode);
  }
  
  /**
   * Check if "review" mode (code review) is active
   */
  public isReviewModeActive(): boolean {
    const state = this.getState();
    return Object.values(state.modes || {}).some(mode => mode === "review");
  }
  
  /**
   * Update the list of available branches and actualize the selected branch.
   *
   * Gets the current branch list through GitService and updates state
   * if the current branch is not available.
   *
   * @returns object with branch list and state change flag
   */
  public async updateBranches(): Promise<{ branches: string[]; changed: boolean }> {
    const state = this.getState();
    const currentBranch = state.targetBranch || "";
    
    // GitService gets branches and actualizes itself
    const { branch: newBranch, branches, changed } = await this.gitService.actualizeBranch(currentBranch);

    // Update state only if branch changed
    if (changed) {
      await this.setState({ targetBranch: newBranch }, "git-service");
    }
    
    return { branches, changed };
  }
  
}

