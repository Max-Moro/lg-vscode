import * as vscode from "vscode";
import type { ProviderModeInfo } from "../../types";
import { BaseAiProvider } from "../../base";

/**
 * OpenAI API Provider
 *
 * Sends content directly to OpenAI API.
 * API key is stored securely in VS Code secrets.
 */
export class OpenAiProvider extends BaseAiProvider {
  readonly id = "com.openai.api";
  readonly name = "OpenAI API";

  async send(content: string, _runs: string): Promise<void> {
    const { getContext } = await import("../../../../bootstrap");
    const token = await getContext().secrets.get("lg.openai.apiKey");
    if (!token) {
      throw new Error("OpenAI API key not configured. Use 'LG: Configure OpenAI API Key' command.");
    }

    await this.sendToApi(content, token);
  }

  private async sendToApi(content: string, token: string): Promise<void> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const reply = data.choices[0]?.message?.content || "No response";

    // Show response in a new document
    const doc = await vscode.workspace.openTextDocument({
      content: reply,
      language: "markdown"
    });
    await vscode.window.showTextDocument(doc);
  }

  getSupportedModes(): ProviderModeInfo[] {
    // OpenAI API is ask-only by nature
    return [
      { modeId: "ask", runs: "" }
    ];
  }
}

export const provider = new OpenAiProvider();
