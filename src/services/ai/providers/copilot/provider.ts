import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../base";

export class CopilotProvider extends BaseExtensionProvider {
  readonly id = "github.copilot";
  readonly name = "GitHub Copilot Chat";
  protected extensionId = "GitHub.copilot-chat";

  /**
   * Проверяет и устанавливает настройку chat.implicitContext.enabled = { panel: "never" }
   * если она не установлена в это значение.
   */
  private async ensureImplicitContextDisabled(): Promise<void> {
    const config = vscode.workspace.getConfiguration();
    const currentValue = config.get<{ panel?: string }>("chat.implicitContext.enabled");
    
    // Проверяем, установлена ли настройка правильно
    if (currentValue?.panel === "never") {
      return; // Настройка уже корректна
    }

    // Устанавливаем нужное значение в глобальных настройках
    await config.update(
      "chat.implicitContext.enabled",
      { panel: "never" },
      vscode.ConfigurationTarget.Global
    );
  }

  protected async sendToExtension(content: string): Promise<void> {
    // Убеждаемся, что implicit context отключен
    await this.ensureImplicitContextDisabled();

    // Создаем новый чат
    await vscode.commands.executeCommand('workbench.action.chat.newChat');

    // Отправляем контент напрямую
    await vscode.commands.executeCommand('workbench.action.chat.open', { query: content });
  }
}

export const provider = new CopilotProvider();