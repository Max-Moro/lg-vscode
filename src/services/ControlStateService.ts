/**
 * Централизованный сервис для управления состоянием панели управления.
 * 
 * Предоставляет:
 * - Единую точку доступа к состоянию (workspace singleton)
 * - Логику работы с дефолтами и эффективными значениями
 * - Автоматическую актуализацию состояния при изменении конфигурации
 * - Преобразование состояния для CLI команд
 */
import * as vscode from "vscode";
import type { ModeSetsList } from "../models/mode_sets_list";
import type { TagSetsList } from "../models/tag_sets_list";
import { GitService } from "./GitService";

/**
 * Модель состояния панели управления
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
}

const STATE_KEY = "lg.control.state";

/**
 * Сервис управления состоянием панели управления
 * 
 * Этот сервис является workspace singleton и предоставляет централизованное
 * управление состоянием для всех компонентов расширения.
 */
export class ControlStateService {
  private static instance: ControlStateService | undefined;
  private gitService: GitService;
  
  /** 
   * Event emitter для уведомления об изменениях состояния.
   * 
   * Используется для синхронизации состояния между различными WebView
   * (например, между Control Panel и Stats Webview).
   * 
   * Механизм работы:
   * 1. Когда любой компонент вызывает setState(), сервис сохраняет изменения
   * 2. Затем сервис уведомляет всех подписчиков через этот event emitter
   * 3. Каждый подписчик может фильтровать события по полю _source,
   *    чтобы избежать циклических обновлений
   */
  private readonly _onDidChangeState = new vscode.EventEmitter<Partial<ControlPanelState>>();
  public readonly onDidChangeState = this._onDidChangeState.event;
  
  private constructor(
    private readonly context: vscode.ExtensionContext
  ) {
    this.gitService = new GitService();
  }
  
  /**
   * Получить singleton инстанс сервиса
   */
  public static getInstance(context: vscode.ExtensionContext): ControlStateService {
    if (!ControlStateService.instance) {
      ControlStateService.instance = new ControlStateService(context);
    }
    return ControlStateService.instance;
  }
  
  // ==================== Базовые операции с состоянием ==================== //
  
  /**
   * Получить текущее состояние из хранилища с автоматическим применением дефолтов.
   * 
   * Гарантирует, что критичные поля (tokenizerLib, encoder, ctxLimit) всегда
   * имеют валидные значения, даже при первом запуске.
   * 
   * @returns Partial<ControlPanelState> с примененными дефолтами
   */
  public getState(): Partial<ControlPanelState> {
    const raw = this.context.workspaceState.get<Partial<ControlPanelState>>(STATE_KEY) || {};
    
    // Применяем дефолты для критичных полей
    return {
      ...raw,
      tokenizerLib: raw.tokenizerLib || "tiktoken",
      encoder: raw.encoder || "cl100k_base",
      ctxLimit: raw.ctxLimit || 128000,
    };
  }
  
  /**
   * Обновить состояние (частичное слияние)
   * 
   * @param partial - частичное состояние для обновления
   * @param source - источник изменения (для предотвращения циклических обновлений)
   */
  public async setState(partial: Partial<ControlPanelState>, source?: string): Promise<void> {
    const current = this.getState();
    const next = { ...current, ...partial };
    await this.context.workspaceState.update(STATE_KEY, next);
    
    // Уведомляем подписчиков об изменении состояния
    // Передаем source для фильтрации в подписчиках
    this._onDidChangeState.fire({ ...partial, _source: source } as any);
  }
  
  /**
   * Сбросить состояние к дефолтным значениям
   */
  public async resetState(): Promise<void> {
    await this.context.workspaceState.update(STATE_KEY, undefined);
  }
  
  
  // ==================== Актуализация состояния ==================== //
  
  /**
   * Актуализировать состояние на основе доступных списков из CLI.
   * Удаляет устаревшие режимы и теги, которых больше нет в манифестах.
   * 
   * @param modeSets - список наборов режимов из 'lg list mode-sets'
   * @param tagSets - список наборов тегов из 'lg list tag-sets'
   * @returns true если состояние было изменено
   */
  public async actualizeState(
    modeSets: ModeSetsList,
    tagSets: TagSetsList
  ): Promise<boolean> {
    const state = this.getState();
    let changed = false;
    
    // Актуализация режимов
    const modesResult = this.actualizeModes(state.modes || {}, modeSets);
    if (modesResult.changed) {
      const updated = { ...state, modes: modesResult.validatedModes };
      await this.context.workspaceState.update(STATE_KEY, updated);
      changed = true;
    }
    
    // Актуализация тегов
    const tagsResult = this.actualizeTags(state.tags || {}, tagSets);
    if (tagsResult.changed) {
      const currentState = this.getState(); // перечитать актуальное состояние
      const updated = { ...currentState, tags: tagsResult.validatedTags };
      await this.context.workspaceState.update(STATE_KEY, updated);
      changed = true;
    }
    
    return changed;
  }
  
  /**
   * Актуализировать режимы: удалить несуществующие наборы и режимы
   */
  private actualizeModes(
    currentModes: Record<string, string>,
    modeSets: ModeSetsList
  ): { validatedModes: Record<string, string>; changed: boolean } {
    const availableModeSetIds = new Set(modeSets["mode-sets"]?.map(ms => ms.id) || []);
    const validatedModes: Record<string, string> = {};
    
    for (const [modeSetId, modeId] of Object.entries(currentModes || {})) {
      if (availableModeSetIds.has(modeSetId)) {
        // Набор режимов существует - проверяем, существует ли конкретный режим
        const modeSet = modeSets["mode-sets"]?.find(ms => ms.id === modeSetId);
        const modeExists = modeSet?.modes?.some(m => m.id === modeId);
        
        if (modeExists) {
          validatedModes[modeSetId] = modeId;
        }
        // Если режим не существует, просто не добавляем его (будет выбран дефолтный в UI)
      }
      // Если набор режимов не существует, пропускаем его (не добавляем в validatedModes)
    }
    
    // Проверяем, были ли изменения
    const changed = 
      Object.keys(currentModes).length !== Object.keys(validatedModes).length ||
      Object.keys(currentModes).some(key => currentModes[key] !== validatedModes[key]);
    
    return { validatedModes, changed };
  }
  
  /**
   * Актуализировать теги: удалить несуществующие наборы тегов и теги
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
      // Проверяем, существует ли набор тегов
      if (availableTagSetIds.has(tagSetId)) {
        const availableTagsInSet = tagSetToTags.get(tagSetId) || new Set();
        // Фильтруем теги, оставляя только существующие в этом наборе
        const validTagsInSet = tagIds.filter(tagId => availableTagsInSet.has(tagId));
        
        // Добавляем в результат только если остались валидные теги
        if (validTagsInSet.length > 0) {
          validatedTags[tagSetId] = validTagsInSet;
        }
      }
      // Если набор тегов не существует, пропускаем его целиком
    }
    
    // Сравниваем структуры для определения изменений
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
   * Валидировать и скорректировать базовые параметры состояния
   * (section, template, tokenizerLib)
   * 
   * @param availableSections - доступные секции
   * @param availableContexts - доступные контексты (шаблоны)
   * @param availableLibs - доступные библиотеки токенизации
   * @returns true если состояние было изменено
   */
  public async validateBasicParams(
    availableSections: string[],
    availableContexts: string[],
    availableLibs: string[]
  ): Promise<boolean> {
    const state = this.getState();
    let changed = false;
    
    // Валидация section
    if (state.section && !availableSections.includes(state.section) && availableSections.length > 0) {
      state.section = availableSections[0];
      changed = true;
    }
    
    // Валидация template
    if (state.template && !availableContexts.includes(state.template) && availableContexts.length > 0) {
      state.template = availableContexts[0];
      changed = true;
    }
    
    // Валидация tokenizerLib
    if (state.tokenizerLib && !availableLibs.includes(state.tokenizerLib) && availableLibs.length > 0) {
      state.tokenizerLib = availableLibs[0];
      changed = true;
    }
    
    if (changed) {
      await this.context.workspaceState.update(STATE_KEY, state);
    }
    
    return changed;
  }
  
  // ==================== Проверка активных режимов ==================== //
  
  /**
   * Проверить, активен ли режим "ask" (спросить AI)
   */
  public isAskModeActive(): boolean {
    const state = this.getState();
    const aiInteractionMode = state.modes?.["ai-interaction"];
    return aiInteractionMode === "ask";
  }
  
  /**
   * Проверить, активен ли режим "agent" (агентная работа с инструментами)
   */
  public isAgentModeActive(): boolean {
    const state = this.getState();
    const aiInteractionMode = state.modes?.["ai-interaction"];
    return aiInteractionMode === "agent";
  }
  
  /**
   * Проверить, активен ли режим "review" (кодревью)
   */
  public isReviewModeActive(): boolean {
    const state = this.getState();
    return Object.values(state.modes || {}).some(mode => mode === "review");
  }
  
  /**
   * Обновить список доступных веток и актуализировать выбранную ветку.
   * 
   * Получает актуальный список веток через GitService и обновляет состояние
   * если текущая ветка недоступна.
   * 
   * @returns объект с списком веток и флагом изменения состояния
   */
  public async updateBranches(): Promise<{ branches: string[]; changed: boolean }> {
    const state = this.getState();
    const currentBranch = state.targetBranch || "";
    
    // GitService сам получает ветки и актуализирует
    const { branch: newBranch, branches, changed } = await this.gitService.actualizeBranch(currentBranch);
    
    // Обновляем состояние только если ветка изменилась
    if (changed) {
      await this.setState({ targetBranch: newBranch }, "git-service");
    }
    
    return { branches, changed };
  }
}

