import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { effectiveWorkspaceRoot } from '../cli/CliResolver';
import { logDebug, logError } from '../logging/log';

/**
 * Interface for Git API (VS Code built-in extension)
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
 * Service for working with Git repository of LG project.
 *
 * Works only with the repository containing the lg-cfg/ directory.
 * Provides a minimal set of methods for getting the list of branches.
 */
export class GitService {
    private gitAPI: GitAPI | undefined;
    private repository: Repository | undefined;
    private initPromise: Promise<void> | undefined;

    /**
     * Lazy initialization of Git API and project repository search.
     * Called once on first access to the service.
     */
    private async ensureInitialized(): Promise<void> {
        if (this.initPromise) {
            return this.initPromise;
        }

        this.initPromise = this.initialize();
        return this.initPromise;
    }

    /**
     * Initialize Git API and find project repository
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
     * Find Git repository for project root (where lg-cfg/ is located)
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
     * Check availability of Git API and project repository
     */
    public async isAvailable(): Promise<boolean> {
        await this.ensureInitialized();
        return this.gitAPI !== undefined && this.repository !== undefined;
    }

  /**
   * Get all project branches (local and remote)
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
   * Get list of all branches as string array (for UI)
   * Combines local and remote branches, removing duplicates and sorting
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
   * Select the best target branch from available ones.
   *
   * @param currentBranch - currently selected branch
   * @param availableBranches - list of available branches
   * @returns best target branch
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
   * Actualize target branch based on list of available branches.
   *
   * Gets the current list of branches from the repository and selects
   * the best target branch for the current state.
   *
   * @param currentBranch - currently selected branch
   * @returns object with new branch, list of available branches, and change flag
   */
  public async actualizeBranch(
    currentBranch: string
  ): Promise<{ branch: string; branches: string[]; changed: boolean }> {
    // Get list of branches
    let branches: string[] = [];
    try {
      if (await this.isAvailable()) {
        branches = await this.getBranchNames();
      }
    } catch (error) {
      // Fail silently if git is not available
      branches = [];
    }

    // Select the best branch
    const newBranch = this.selectBestTargetBranch(currentBranch, branches);
    const changed = newBranch !== currentBranch;

    return { branch: newBranch, branches, changed };
  }
}
