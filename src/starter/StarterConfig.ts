/**
 * Starter config wizard for Listing Generator — wraps `lg init`.
 * - Lists presets via `lg init --list-presets`
 * - Lets user pick options (examples/models)
 * - Handles conflicts (offers --force overwrite)
 * - Opens lg-cfg/sections.yaml on success
 */
import * as vscode from "vscode";
import * as path from "path";
import { effectiveWorkspaceRoot, runCli } from "../cli/CliResolver";

/** Public entry: interactive wizard to initialize lg-cfg via `lg init`. */
export async function runInitWizard(): Promise<void> {
  const root = effectiveWorkspaceRoot();
  if (!root) {
    vscode.window.showErrorMessage("Open a folder to create starter config.");
    return;
  }

  // 1) Query available presets from CLI (fallback to "basic")
  const presets = await listPresetsSafe();
  const preset = await vscode.window.showQuickPick(presets, {
    placeHolder: "Select preset for `lg init`",
  });
  if (!preset) return;

  // 2) Options: include example templates & models.yaml
  const includeExamples =
    (await vscode.window.showQuickPick(["Yes", "No"], {
      placeHolder: "Include example templates (.tpl/.ctx)?",
    })) !== "No";
  const includeModels =
    (await vscode.window.showQuickPick(["No", "Yes"], {
      placeHolder: "Also include models.yaml?",
    })) === "Yes";

  const baseArgs = ["init", "--preset", preset]
    .concat(includeExamples ? [] : ["--no-examples"])
    .concat(includeModels ? ["--with-models"] : []);

  const runOnce = async (extra: string[] = []) => {
    const out = await runCli([...baseArgs, ...extra], { timeoutMs: 120_000 });
    try {
      return JSON.parse(out);
    } catch {
      throw new Error("Unexpected CLI output (not JSON).");
    }
  };

  try {
    const res = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "LG: Initializing lg-cfg (lg init)…",
        cancellable: false,
      },
      () => runOnce()
    );

    // Conflicts without --force
    if (!res?.ok) {
      const conflicts = Array.isArray(res?.conflicts) ? (res.conflicts as string[]) : [];
      if (conflicts.length) {
        const choice = await vscode.window.showWarningMessage(
          `lg-cfg already contains ${conflicts.length} file(s). Overwrite with --force?`,
          "Overwrite",
          "Cancel"
        );
        if (choice === "Overwrite") {
          const forced = await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: "LG: Overwriting existing lg-cfg…",
              cancellable: false,
            },
            () => runOnce(["--force"])
          );
          if (!forced?.ok) throw new Error(forced?.error || "Failed to initialize lg-cfg");
          await openSectionsYaml(root);
          vscode.window.showInformationMessage("LG: Starter config initialized (overwritten).");
          return;
        }
        return; // user cancelled overwrite
      }
      // No conflicts field — bubble up generic error (e.g., preset not found)
      throw new Error(res?.error || "Failed to initialize lg-cfg");
    }

    await openSectionsYaml(root);
    vscode.window.showInformationMessage("LG: Starter config created.");
  } catch (e: any) {
    vscode.window.showErrorMessage(`LG: ${e?.message || e}`);
  }
}

// ----------------------------- internals ----------------------------- //

async function listPresetsSafe(): Promise<string[]> {
  try {
    const raw = await runCli(["init", "--list-presets"], { timeoutMs: 20_000 });
    const data = JSON.parse(raw);
    const presets = Array.isArray(data?.presets) ? (data.presets as string[]) : [];
    return presets.length ? presets : ["basic"];
  } catch {
    return ["basic"];
  }
}

async function openSectionsYaml(rootFs: string) {
  const uri = vscode.Uri.file(path.join(rootFs, "lg-cfg", "sections.yaml"));
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    await vscode.window.showTextDocument(doc, { preview: false });
  } catch {
    // Some presets might not include sections.yaml; ignore silently.
  }
}
