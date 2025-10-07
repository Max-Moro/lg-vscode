import * as vscode from 'vscode';

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
 * Сервис для работы с Git через встроенное API VS Code
 */
export class GitService {
    private gitExtension: GitExtension | undefined;
    private gitAPI: GitAPI | undefined;

    constructor() {
        this.initialize();
    }

    /**
     * Инициализация Git API
     */
    private initialize() {
        try {
            // Получаем встроенное расширение Git
            const extension = vscode.extensions.getExtension<GitExtension>('vscode.git');
            
            if (extension) {
                if (!extension.isActive) {
                    // Если расширение не активно, активируем его
                    extension.activate().then(() => {
                        this.gitExtension = extension.exports;
                        this.gitAPI = this.gitExtension.getAPI(1);
                    });
                } else {
                    this.gitExtension = extension.exports;
                    this.gitAPI = this.gitExtension.getAPI(1);
                }
            }
        } catch (error) {
            console.error('Failed to initialize Git API:', error);
        }
    }

    /**
     * Проверка доступности Git API
     */
    public isAvailable(): boolean {
        return this.gitAPI !== undefined;
    }

    /**
     * Получить все репозитории в рабочей области
     */
    public getRepositories(): Repository[] {
        if (!this.gitAPI) {
            return [];
        }
        return this.gitAPI.repositories;
    }

    /**
     * Получить репозиторий для конкретной папки
     */
    public getRepository(uri: vscode.Uri): Repository | null {
        if (!this.gitAPI) {
            return null;
        }
        return this.gitAPI.getRepository(uri);
    }

    /**
     * Получить все локальные ветки для репозитория
     */
    public async getLocalBranches(repository: Repository): Promise<Ref[]> {
        try {
            const branches = await repository.getBranches({ remote: false });
            return branches;
        } catch (error) {
            console.error('Failed to get local branches:', error);
            return [];
        }
    }

    /**
     * Получить все удалённые ветки для репозитория
     */
    public async getRemoteBranches(repository: Repository): Promise<Ref[]> {
        try {
            const branches = await repository.getBranches({ remote: true });
            return branches;
        } catch (error) {
            console.error('Failed to get remote branches:', error);
            return [];
        }
    }

    /**
     * Получить все ветки (локальные и удалённые)
     */
    public async getAllBranches(repository: Repository): Promise<{ local: Ref[]; remote: Ref[] }> {
        const [local, remote] = await Promise.all([
            this.getLocalBranches(repository),
            this.getRemoteBranches(repository)
        ]);

        return { local, remote };
    }

    /**
     * Получить текущую ветку
     */
    public getCurrentBranch(repository: Repository): Branch | undefined {
        return repository.state.HEAD;
    }

    /**
     * Получить информацию о всех ветках в первом найденном репозитории
     */
    public async getBranchesInfo(): Promise<{
        currentBranch?: string;
        localBranches: string[];
        remoteBranches: string[];
    } | null> {
        if (!this.gitAPI || this.gitAPI.repositories.length === 0) {
            return null;
        }

        const repo = this.gitAPI.repositories[0];
        const current = this.getCurrentBranch(repo);
        const { local, remote } = await this.getAllBranches(repo);

        return {
            currentBranch: current?.name,
            localBranches: local.map(b => b.name || '').filter(n => n),
            remoteBranches: remote.map(b => b.name || '').filter(n => n)
        };
    }

    /**
     * Получить все remotes для репозитория
     */
    public getRemotes(repository: Repository): Remote[] {
        return repository.state.remotes;
    }

    /**
     * Пример использования: вывод информации о ветках в консоль
     */
    public async logBranchesInfo() {
        const info = await this.getBranchesInfo();
        
        if (!info) {
            console.log('Git repository not found');
            return;
        }

        console.log('Current branch:', info.currentBranch);
        console.log('Local branches:', info.localBranches);
        console.log('Remote branches:', info.remoteBranches);
    }
}
