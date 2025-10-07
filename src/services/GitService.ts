import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { effectiveWorkspaceRoot } from '../cli/CliResolver';

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
    state: RepositoryState;
    getBranches(query?: { remote?: boolean }): Promise<Ref[]>;
    getCommit(ref: string): Promise<Commit>;
    onDidChangeRepository: vscode.Event<vscode.Uri>;
    // ... другие методы
}

interface RepositoryState {
    HEAD: Branch | undefined;
    refs: Ref[];
    remotes: Remote[];
    workingTreeChanges: any[];
    indexChanges: any[];
    mergeChanges: any[];
    // ... другие свойства
}

interface Ref {
    type: RefType;
    name?: string;
    commit?: string;
    remote?: string;
}

interface Branch extends Ref {
    readonly upstream?: Ref;
    readonly ahead?: number;
    readonly behind?: number;
}

interface Remote {
    name: string;
    fetchUrl?: string;
    pushUrl?: string;
}

interface Commit {
    hash: string;
    message: string;
    parents: string[];
    authorDate?: Date;
    authorName?: string;
    authorEmail?: string;
}

enum RefType {
    Head,
    RemoteHead,
    Tag
}

/**
 * Сервис для работы с Git репозиторием проекта LG.
 * 
 * Работает только с репозиторием, где находится директория lg-cfg/.
 * Это основной корень проекта, определяемый через effectiveWorkspaceRoot().
 */
export class GitService {
    private gitExtension: GitExtension | undefined;
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
            // Получаем встроенное расширение Git
            const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            
            if (!extension) {
                return;
            }

            // Активируем расширение при необходимости
            if (!extension.isActive) {
                await extension.activate();
            }

            this.gitExtension = extension.exports;
            this.gitAPI = this.gitExtension.getAPI(1);

            // Находим репозиторий для корня проекта с lg-cfg/
            this.findProjectRepository();

        } catch (error) {
            console.error('Failed to initialize Git API:', error);
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

        // Проверяем, что lg-cfg/ действительно существует
        const lgCfgPath = path.join(projectRoot, 'lg-cfg');
        if (!fs.existsSync(lgCfgPath)) {
            return;
        }

        // Ищем репозиторий для этого корня
        const projectUri = vscode.Uri.file(projectRoot);
        const foundRepo = this.gitAPI.getRepository(projectUri);
        
        if (foundRepo) {
            this.repository = foundRepo;
        } else {
            // Пробуем найти среди всех репозиториев
            this.repository = this.gitAPI.repositories.find(repo => {
                const repoPath = repo.rootUri.fsPath;
                // Проверяем, что projectRoot находится внутри или совпадает с repo root
                return projectRoot.startsWith(repoPath) || repoPath.startsWith(projectRoot);
            });
        }
    }

    /**
     * Проверка доступности Git API и репозитория проекта
     */
    public isAvailable(): boolean {
        return this.gitAPI !== undefined && this.repository !== undefined;
    }

    /**
     * Получить репозиторий проекта (с lg-cfg/)
     */
    public getRepository(): Repository | undefined {
        return this.repository;
    }

    /**
     * Получить все локальные ветки проекта
     */
    public async getLocalBranches(): Promise<Ref[]> {
        if (!this.repository) {
            return [];
        }

        try {
            const branches = await this.repository.getBranches({ remote: false });
            return branches;
        } catch (error) {
            console.error('Failed to get local branches:', error);
            return [];
        }
    }

    /**
     * Получить все удалённые ветки проекта
     */
    public async getRemoteBranches(): Promise<Ref[]> {
        if (!this.repository) {
            return [];
        }

        try {
            const branches = await this.repository.getBranches({ remote: true });
            return branches;
        } catch (error) {
            console.error('Failed to get remote branches:', error);
            return [];
        }
    }

    /**
     * Получить все ветки проекта (локальные и удалённые)
     */
    public async getAllBranches(): Promise<{ local: Ref[]; remote: Ref[] }> {
        const [local, remote] = await Promise.all([
            this.getLocalBranches(),
            this.getRemoteBranches()
        ]);

        return { local, remote };
    }

    /**
     * Получить текущую ветку проекта
     */
    public getCurrentBranch(): Branch | undefined {
        if (!this.repository) {
            return undefined;
        }
        return this.repository.state.HEAD;
    }

    /**
     * Получить имя текущей ветки проекта
     */
    public getCurrentBranchName(): string | undefined {
        return this.getCurrentBranch()?.name;
    }

    /**
     * Получить информацию о всех ветках проекта
     */
    public async getBranchesInfo(): Promise<{
        repoPath?: string;
        currentBranch?: string;
        localBranches: string[];
        remoteBranches: string[];
    } | null> {
        if (!this.repository) {
            return null;
        }

        const current = this.getCurrentBranch();
        const { local, remote } = await this.getAllBranches();

        return {
            repoPath: this.repository.rootUri.fsPath,
            currentBranch: current?.name,
            localBranches: local.map(b => b.name || '').filter(n => n),
            remoteBranches: remote.map(b => b.name || '').filter(n => n)
        };
    }

    /**
     * Получить все remotes проекта
     */
    public getRemotes(): Remote[] {
        if (!this.repository) {
            return [];
        }
        return this.repository.state.remotes;
    }

    /**
     * Получить информацию об upstream текущей ветки
     */
    public getUpstreamInfo(): { 
        upstream?: string; 
        ahead?: number; 
        behind?: number 
    } | null {
        const currentBranch = this.getCurrentBranch();
        if (!currentBranch || !('upstream' in currentBranch)) {
            return null;
        }

        return {
            upstream: currentBranch.upstream?.name,
            ahead: currentBranch.ahead,
            behind: currentBranch.behind
        };
    }

    /**
     * Проверить, есть ли незакоммиченные изменения
     */
    public hasUncommittedChanges(): boolean {
        if (!this.repository) {
            return false;
        }

        const state = this.repository.state;
        return (
            state.workingTreeChanges.length > 0 ||
            state.indexChanges.length > 0 ||
            state.mergeChanges.length > 0
        );
    }

    /**
     * Подписаться на изменения в репозитории проекта
     */
    public onDidChange(listener: () => void): vscode.Disposable | undefined {
        if (!this.repository) {
            return undefined;
        }

        return this.repository.onDidChangeRepository(listener);
    }

    /**
     * Вывод информации о ветках в консоль (для отладки)
     */
    public async logBranchesInfo() {
        const info = await this.getBranchesInfo();
        
        if (!info) {
            console.log('Git repository not found in project with lg-cfg/');
            return;
        }

        console.log('=== Git Repository Info (lg-cfg project) ===');
        console.log('Repository path:', info.repoPath);
        console.log('Current branch:', info.currentBranch);
        console.log('Local branches:', info.localBranches);
        console.log('Remote branches:', info.remoteBranches);
        
        const upstream = this.getUpstreamInfo();
        if (upstream) {
            console.log('Upstream:', upstream.upstream);
            console.log('Ahead:', upstream.ahead, 'Behind:', upstream.behind);
        }
        
        console.log('Has uncommitted changes:', this.hasUncommittedChanges());
    }
}
