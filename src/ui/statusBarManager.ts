import * as vscode from 'vscode';

export type ExtensionStatus = 'idle' | 'watching' | 'applying' | 'error';

/**
 * Управляет элементом Status Bar — показывает состояние extension.
 * Кликабелен — открывает Output Channel с логами.
 */
export class StatusBarManager {
  private readonly item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100,
    );
    this.item.command = 'gms2-live-edit.openLogs';
    this.set('idle');
    this.item.show();
  }

  set(status: ExtensionStatus, detail?: string): void {
    switch (status) {
      case 'idle':
        this.item.text    = '$(zap) GMSync';
        this.item.tooltip = new vscode.MarkdownString('**GMSync: AI Edition**\n\nОжидание проекта — откройте папку с `.yyp` файлом\n\n*Нажмите чтобы открыть логи*');
        this.item.backgroundColor = undefined;
        this.item.color   = undefined;
        break;

      case 'watching':
        this.item.text    = `$(eye) GMSync$(chevron-right)${detail ?? 'watching'}`;
        this.item.tooltip = new vscode.MarkdownString(`**GMSync: AI Edition**\n\n$(eye) Слежение за проектом${detail ? '\n\n' + detail : ''}\n\n*Нажмите чтобы открыть логи*`);
        this.item.backgroundColor = undefined;
        this.item.color   = undefined;
        break;

      case 'applying':
        this.item.text    = '$(sync~spin) GMSync$(chevron-right)applying…';
        this.item.tooltip = new vscode.MarkdownString(`**GMSync: AI Edition**\n\n$(sync~spin) Применяю изменения${detail ? '\n\n' + detail : ''}`);
        this.item.backgroundColor = undefined;
        this.item.color   = new vscode.ThemeColor('statusBarItem.warningForeground');
        break;

      case 'error':
        this.item.text    = '$(error) GMSync$(chevron-right)error';
        this.item.tooltip = new vscode.MarkdownString(`**GMSync: AI Edition**\n\n$(error) Ошибка${detail ? '\n\n' + detail : ''}\n\n*Нажмите чтобы открыть логи*`);
        this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        this.item.color   = undefined;
        break;
    }
  }

  dispose(): void {
    this.item.dispose();
  }
}
