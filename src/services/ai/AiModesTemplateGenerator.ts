/**
 * Generator for ai-interaction.sec.yaml template file.
 *
 * Collects supported modes from all registered AI providers
 * and generates/updates the canonical integration meta-section.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { AiIntegrationService } from "./AiIntegrationService";
import { effectiveWorkspaceRoot } from "../../cli/CliResolver";
import { logInfo, logDebug } from "../../logging/log";

/**
 * Mode definition for YAML generation.
 */
interface ModeDefinition {
  title: string;
  description?: string;
  tags?: string[];
  runs: Record<string, string>;
}

/**
 * Canonical mode definitions with metadata.
 */
const CANONICAL_MODES: Record<string, Omit<ModeDefinition, "runs">> = {
  ask: {
    title: "Ask",
    description: "Question-answer mode"
  },
  agent: {
    title: "Agent",
    description: "Agent mode with tools",
    tags: ["agent"]
  },
  plan: {
    title: "Plan",
    description: "Planning / specification mode",
    tags: ["agent", "plan"]
  }
};

/**
 * Generates and updates ai-interaction.sec.yaml file.
 */
export class AiModesTemplateGenerator {
  private readonly aiService: AiIntegrationService;

  constructor(aiService: AiIntegrationService) {
    this.aiService = aiService;
  }

  /**
   * Generates or updates the ai-interaction.sec.yaml file.
   *
   * Merge logic:
   * - Preserves unknown modes and providers
   * - Updates only runs for known providers
   * - Adds new modes if not present
   *
   * @returns Path to generated file
   * @throws Error if workspace root not found or write fails
   */
  async generate(): Promise<string> {
    const root = effectiveWorkspaceRoot();
    if (!root) {
      throw new Error("No workspace root found");
    }

    const lgCfgPath = path.join(root, "lg-cfg");
    const filePath = path.join(lgCfgPath, "ai-interaction.sec.yaml");

    logInfo(`[AiModesTemplateGenerator] Generating ${filePath}`);

    // Ensure lg-cfg directory exists
    if (!fs.existsSync(lgCfgPath)) {
      fs.mkdirSync(lgCfgPath, { recursive: true });
      logDebug("[AiModesTemplateGenerator] Created lg-cfg directory");
    }

    // Collect modes from all providers
    const allModes = this.aiService.getAllSupportedModes();
    logDebug(`[AiModesTemplateGenerator] Collected modes for ${allModes.size} mode types`);

    // Read existing file if present
    let existingContent = "";
    if (fs.existsSync(filePath)) {
      existingContent = fs.readFileSync(filePath, "utf-8");
      logDebug("[AiModesTemplateGenerator] Read existing file");
    }

    // Merge and generate new content
    const newContent = this.mergeAndGenerate(existingContent, allModes);

    // Write file
    fs.writeFileSync(filePath, newContent, "utf-8");
    logInfo(`[AiModesTemplateGenerator] Written ${filePath}`);

    return filePath;
  }

  /**
   * Merges existing content with new modes data.
   *
   * Uses simple line-based parsing to preserve formatting and comments.
   */
  private mergeAndGenerate(
    existingContent: string,
    allModes: Map<string, Map<string, string>>
  ): string {
    // If no existing content, generate fresh
    if (!existingContent.trim()) {
      return this.generateFresh(allModes);
    }

    // Parse existing runs per mode
    const existingRuns = this.parseExistingRuns(existingContent);

    // Merge: new providers override, unknown providers preserved
    for (const [modeId, providers] of allModes) {
      if (!existingRuns.has(modeId)) {
        existingRuns.set(modeId, new Map());
      }
      const modeRuns = existingRuns.get(modeId)!;
      for (const [providerId, runs] of providers) {
        modeRuns.set(providerId, runs);
      }
    }

    // Regenerate with merged data
    return this.generateFresh(existingRuns);
  }

  /**
   * Parses existing YAML to extract runs per mode.
   *
   * Simple line-based parsing (not full YAML parser to preserve formatting).
   */
  private parseExistingRuns(content: string): Map<string, Map<string, string>> {
    const result = new Map<string, Map<string, string>>();

    // Simple line-based parsing
    let currentMode: string | null = null;
    let inRuns = false;

    for (const line of content.split("\n")) {
      // Detect mode start (8 spaces indent)
      const modeMatch = line.match(/^        (\w+):\s*$/);
      if (modeMatch) {
        currentMode = modeMatch[1];
        inRuns = false;
        continue;
      }

      // Detect runs section
      if (line.trim() === "runs:" && currentMode) {
        inRuns = true;
        if (!result.has(currentMode)) {
          result.set(currentMode, new Map());
        }
        continue;
      }

      // Parse provider runs (12 spaces indent)
      if (inRuns && currentMode) {
        const runsMatch = line.match(/^            ([a-z0-9._-]+):\s*"?([^"]*)"?\s*$/);
        if (runsMatch) {
          const providerId = runsMatch[1];
          const runsValue = runsMatch[2].trim();
          result.get(currentMode)!.set(providerId, runsValue);
        } else if (!line.startsWith("            ") && line.trim()) {
          // End of runs section
          inRuns = false;
        }
      }
    }

    return result;
  }

  /**
   * Generates fresh YAML content from modes data.
   */
  private generateFresh(allModes: Map<string, Map<string, string>>): string {
    const lines: string[] = [
      "# Auto-generated by Listing Generator IDE plugins",
      "# This file defines AI provider integration modes.",
      "# Manual edits to unknown providers/modes will be preserved.",
      "",
      "ai-interaction:",
      "  mode-sets:",
      "    ai-interaction:",
      '      title: "AI Interaction"',
      "      modes:"
    ];

    // Process canonical modes first (in order)
    const processedModes = new Set<string>();
    for (const modeId of Object.keys(CANONICAL_MODES)) {
      const providers = allModes.get(modeId);
      if (providers && providers.size > 0) {
        this.appendMode(lines, modeId, CANONICAL_MODES[modeId], providers);
        processedModes.add(modeId);
      }
    }

    // Process any non-canonical modes (from existing file)
    for (const [modeId, providers] of allModes) {
      if (!processedModes.has(modeId) && providers.size > 0) {
        // Unknown mode - generate with minimal metadata
        this.appendMode(lines, modeId, { title: modeId }, providers);
      }
    }

    return lines.join("\n") + "\n";
  }

  /**
   * Appends a mode block to lines array.
   */
  private appendMode(
    lines: string[],
    modeId: string,
    meta: Omit<ModeDefinition, "runs">,
    providers: Map<string, string>
  ): void {
    lines.push(`        ${modeId}:`);
    lines.push(`          title: "${meta.title}"`);

    if (meta.description) {
      lines.push(`          description: "${meta.description}"`);
    }

    if (meta.tags && meta.tags.length > 0) {
      lines.push(`          tags: [${meta.tags.join(", ")}]`);
    }

    lines.push("          runs:");

    // Sort providers for consistent output
    const sortedProviders = [...providers.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [providerId, runs] of sortedProviders) {
      lines.push(`            ${providerId}: "${runs}"`);
    }
  }
}
