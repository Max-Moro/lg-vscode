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

    constructor() {
        this.initialize();
    }

    /**
     * Инициализация Git API и поиск репозитория проекта
     */
    private async initialize() {
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
            logDebug('[GitService] No workspace root found');
            return;
        }

        const lgCfgPath = path.join(projectRoot, 'lg-cfg');
        if (!fs.existsSync(lgCfgPath)) {
            logDebug('[GitService] lg-cfg directory not found');
            return;
        }

        const projectUri = vscode.Uri.file(projectRoot);
        const foundRepo = this.gitAPI.getRepository(projectUri);
        
        if (foundRepo) {
            this.repository = foundRepo;
            logDebug('[GitService] Repository found directly');
        } else {
            this.repository = this.gitAPI.repositories.find(repo => {
                const repoPath = repo.rootUri.fsPath;
                return projectRoot.startsWith(repoPath) || repoPath.startsWith(projectRoot);
            });
            
            if (this.repository) {
                logDebug('[GitService] Repository found in workspace repositories');
            } else {
                logDebug('[GitService] No repository found for project root');
            }
        }
    }

    /**
     * Проверка доступности Git API и репозитория проекта
     */
    public isAvailable(): boolean {
        return this.gitAPI !== undefined && this.repository !== undefined;
    }

    /**
     * Получить все ветки проекта (локальные и удалённые)
     */
    public async getAllBranches(): Promise<{ local: Ref[]; remote: Ref[] }> {
        if (!this.repository) {
            logDebug('[GitService] getAllBranches: repository not available');
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
}
