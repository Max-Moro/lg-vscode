import * as vscode from "vscode";
import { BaseForkProvider } from "../../base";

export class CursorProvider extends BaseForkProvider {
  readonly id = "cursor.composer";
  readonly name = "Cursor Composer";

  async send(content: string): Promise<void> {
    // TODO
  }
}

export const provider = new CursorProvider();