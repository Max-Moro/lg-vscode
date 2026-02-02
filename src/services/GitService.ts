import { execFile } from 'child_process';
import { promisify } from 'util';
import { effectiveWorkspaceRoot } from '../cli/CliResolver';
import { logDebug, logError } from '../logging/log';

const execFileAsync = promisify(execFile);

/**
 * Service for getting Git branch information via direct CLI calls.
 * Does not use VS Code Git API due to submodule compatibility issues.
 */
export class GitService {
  /**
   * Get list of all branches (local and remote) as string array.
   */
  public async getBranchNames(): Promise<string[]> {
    const projectRoot = effectiveWorkspaceRoot();
    if (!projectRoot) {
      return [];
    }

    try {
      const { stdout } = await execFileAsync('git', ['branch', '-a', '--format=%(refname:short)'], {
        cwd: projectRoot
      });

      const branches = stdout
        .split('\n')
        .map(b => b.trim())
        .filter(b => b.length > 0);

      logDebug(`[GitService] Found ${branches.length} branches`);
      return Array.from(new Set(branches)).sort();
    } catch (error) {
      logError('[GitService] Failed to get branches', error);
      return [];
    }
  }
}
