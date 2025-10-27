import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { effectiveWorkspaceRoot } from '../cli/CliResolver';
import { logDebug, logError } from '../logging/log';

/**
 * Интерфейс для Git API (встроенное расширение VS Code)
 */
interface GitExtension {
    getAPI(version: number): GitAPI;
}

interface GitAPI {
    repositories: Repository[];
    getRepository(uri: vscode.Uri): Repository | null;
}

interface Repository {
    rootUri: vscode.Uri;
    getBranches(query?: { remote?: boolean }): Promise<Ref[]>;
}

interface Ref {
    name?: string;
}

/**
 * Сервис для работы с Git репозиторием проекта LG.
 * 
 * Работает только с репозиторием, где находится директория lg-cfg/.
 * Предоставляет минимальный набор методов для получения списка веток.
 */
export class GitService {
    private gitAPI: GitAPI | undefined;
    private repository: Repository | undefined;
    private initPromise: Promise<void> | undefined;

    /**
     * Ленивая инициализация Git API и поиск репозитория проекта.
     * Вызывается один раз при первом обращении к сервису.
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.initialize();
        return this.initPromise;
    }

    /**
     * Инициализация Git API и поиск репозитория проекта
     */
    private async initialize(): Promise<void> {
        try {
            const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            
            if (!extension) {
                logDebug('[GitService] Git extension not found');
                return;
            }

            if (!extension.isActive) {
                await extension.activate();
            }

            this.gitAPI = extension.exports.getAPI(1);
            this.findProjectRepository();

        } catch (error) {
            logError('[GitService] Failed to initialize Git API', error);
        }
    }

    /**
     * Найти Git репозиторий для корня проекта (где находится lg-cfg/)
     */
    private findProjectRepository(): void {
        if (!this.gitAPI) {
            return;
        }

        const projectRoot = effectiveWorkspaceRoot();
        if (!projectRoot) {
            return;
        }

        const lgCfgPath = path.join(projectRoot, 'lg-cfg');
        if (!fs.existsSync(lgCfgPath)) {
            return;
        }

        const projectUri = vscode.Uri.file(projectRoot);
        const foundRepo = this.gitAPI.getRepository(projectUri);
        
        if (foundRepo) {
            this.repository = foundRepo;
            logDebug(`[GitService] Repository found: ${foundRepo.rootUri.fsPath}`);
        } else {
            this.repository = this.gitAPI.repositories.find(repo => {
                const repoPath = repo.rootUri.fsPath;
                return projectRoot.startsWith(repoPath) || repoPath.startsWith(projectRoot);
            });
            
            if (this.repository) {
                logDebug(`[GitService] Repository found: ${this.repository.rootUri.fsPath}`);
            } else {
                logDebug('[GitService] No repository found for project root');
            }
        }
    }

    /**
     * Проверка доступности Git API и репозитория проекта
     */
    public async isAvailable(): Promise<boolean> {
        await this.ensureInitialized();
        return this.gitAPI !== undefined && this.repository !== undefined;
    }

  /**
   * Получить все ветки проекта (локальные и удалённые)
   */
  public async getAllBranches(): Promise<{ local: Ref[]; remote: Ref[] }> {
    await this.ensureInitialized();
    
    if (!this.repository) {
      return { local: [], remote: [] };
    }

    try {
      const [local, remote] = await Promise.all([
        this.repository.getBranches({ remote: false }),
        this.repository.getBranches({ remote: true })
      ]);

      logDebug(`[GitService] Found ${local.length} local and ${remote.length} remote branches`);
      return { local, remote };
    } catch (error) {
      logError('[GitService] Failed to get branches', error);
      return { local: [], remote: [] };
    }
  }
  
  /**
   * Получить список всех веток в виде массива строк (для UI)
   * Объединяет локальные и удалённые ветки, удаляя дубликаты и сортируя
   */
  public async getBranchNames(): Promise<string[]> {
    const branchesInfo = await this.getAllBranches();
    
    // Combine local and remote branches, removing duplicates
    const allBranches = [
      ...branchesInfo.local.map(b => b.name).filter((n): n is string => !!n),
      ...branchesInfo.remote.map(b => b.name).filter((n): n is string => !!n)
    ];
    
    // Remove duplicates and sort
    const uniqueBranches = Array.from(new Set(allBranches)).sort();
    
    return uniqueBranches;
  }

  /**
   * Выбрать лучшую целевую ветку из доступных.
   * 
   * @param currentBranch - текущая выбранная ветка
   * @param availableBranches - список доступных веток
   * @returns лучшая целевая ветка
   */
  public selectBestTargetBranch(currentBranch: string, availableBranches: string[]): string {
    if (availableBranches.length === 0) {
      return "";
    }
    
    const branchSet = new Set(availableBranches);
    const candidates = [
      currentBranch,
      "main",
      "master", 
      "origin/main",
      "origin/master"
    ];
    
    return candidates.find(b => b && branchSet.has(b)) || availableBranches[0];
  }

  /**
   * Актуализировать целевую ветку на основе списка доступных веток.
   * 
   * Получает актуальный список веток из репозитория и выбирает
   * лучшую целевую ветку для текущего состояния.
   * 
   * @param currentBranch - текущая выбранная ветка
   * @returns объект с новой веткой, списком доступных веток и флагом изменения
   */
  public async actualizeBranch(
    currentBranch: string
  ): Promise<{ branch: string; branches: string[]; changed: boolean }> {
    // Получаем список веток
    let branches: string[] = [];
    try {
      if (await this.isAvailable()) {
        branches = await this.getBranchNames();
      }
    } catch (error) {
      // Fail silently if git is not available
      branches = [];
    }
    
    // Выбираем лучшую ветку
    const newBranch = this.selectBestTargetBranch(currentBranch, branches);
    const changed = newBranch !== currentBranch;
    
    return { branch: newBranch, branches, changed };
  }
}
