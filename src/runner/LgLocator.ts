/**
 * Локатор и будущий инсталлятор CLI.
 * Сейчас: ищем явный путь в настройках. Если нет — показываем подсказку.
 * Следующей итерацией добавим managed venv + запуск внешнего процесса.
 */
import * as vscode from "vscode";
import * as path from "path";
import { spawnToString } from "./LgProcess";

export async function locateCliOrOfferInstall(ctx: vscode.ExtensionContext): Promise<string | undefined> {
  const explicit = vscode.workspace.getConfiguration().get<string>("lg.cli.path");
  if (explicit && explicit.trim()) {
    return explicit;
  }
  // TODO: auto-detect managed venv in ctx.globalStorageUri.fsPath
  // TODO: try system: 'listing-generator' in PATH, 'py -m listing_generator', etc.

  // Пока просто намекаем пользователю
  const choice = await vscode.window.showInformationMessage(
    "Listing Generator CLI не настроен. Установить и управлять автоматически?",
    "Да", "Позже"
  );
  if (choice === "Да") {
    // TODO: здесь вызовем установщик managed venv
    vscode.window.showInformationMessage("Авто-установщик появится в следующей итерации.");
  }
  return undefined;
}

// Временный заглушечный раннер: покажем как это будет выглядеть
export async function runLgTextCommandStub(args: string[], cwd?: string): Promise<string> {
  const text = `# LG CLI (stub)\nБудет запущено: listing-generator ${args.join(" ")}\nCWD: ${cwd ?? "<workspace>"}`;
  return text;
}
