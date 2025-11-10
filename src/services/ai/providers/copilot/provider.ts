import * as vscode from "vscode";
import { BaseExtensionProvider } from "../../base";
import type { AiInteractionMode } from "../../../../models/AiInteractionMode";

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

  protected async sendToExtension(content: string, mode: AiInteractionMode): Promise<void> {
    // Убеждаемся, что implicit context отключен
    await this.ensureImplicitContextDisabled();

    // Создаем новый чат
    await vscode.commands.executeCommand('workbench.action.chat.newChat');

    // Выбираем команду в зависимости от режима
    const command = mode === "ask"
      ? 'workbench.action.chat.openask'
      : 'workbench.action.chat.openagent';

    // Отправляем контент в соответствующем режиме
    await vscode.commands.executeCommand(command, { query: content });
  }
}

export const provider = new CopilotProvider();