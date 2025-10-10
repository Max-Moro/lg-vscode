import * as vscode from "vscode";
import type { ProviderDetector } from "../../types";

export const detector: ProviderDetector = {
  priority: 35,

  async detect(): Promise<boolean> {
    // Проверяем наличие токена в секретах
    // Не можем получить context здесь, поэтому просто возвращаем false
    // Пользователь должен явно выбрать этот провайдер и настроить токен
    return false;
  }
};