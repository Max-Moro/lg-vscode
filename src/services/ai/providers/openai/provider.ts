import * as vscode from "vscode";
import { BaseNetworkProvider } from "../../base";

export class OpenAiProvider extends BaseNetworkProvider {
  readonly id = "openai.api";
  readonly name = "OpenAI API";
  protected apiEndpoint = "https://api.openai.com/v1/chat/completions";
  protected secretKey = "lg.openai.apiKey";

  protected async sendToApi(content: string, token: string): Promise<void> {
    const requestBody = {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: content
        }
      ],
      stream: false
    };

    const response = await this.fetchWithTimeout(
      this.apiEndpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify(requestBody)
      },
      30000
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    // Не читаем ответ, просто показываем успех
    vscode.window.showInformationMessage(
      "Content sent to OpenAI API successfully. Check your OpenAI chat interface."
    );
  }
}

export const provider = new OpenAiProvider();