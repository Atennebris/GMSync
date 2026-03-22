import * as vscode from 'vscode';

let outputChannel: vscode.OutputChannel | undefined;

const isDev = process.env.NODE_ENV !== 'production';

export function initLogger(channel: vscode.OutputChannel): void {
  outputChannel = channel;
}

function format(level: string, ctx: string, msg: string, data?: unknown): string {
  const ts = new Date().toISOString();
  const dataStr = data !== undefined ? ' ' + JSON.stringify(data) : '';
  return `[${ts}] [${level}] [${ctx}] ${msg}${dataStr}`;
}

export const logger = {
  error(ctx: string, msg: string, data?: unknown): void {
    const line = format('ERROR', ctx, msg, data);
    outputChannel?.appendLine(line);
    console.error(line);
  },

  warn(ctx: string, msg: string, data?: unknown): void {
    const line = format('WARN ', ctx, msg, data);
    outputChannel?.appendLine(line);
    if (isDev) console.warn(line);
  },

  info(ctx: string, msg: string, data?: unknown): void {
    const line = format('INFO ', ctx, msg, data);
    outputChannel?.appendLine(line);
    if (isDev) console.info(line);
  },

  debug(ctx: string, msg: string, data?: unknown): void {
    if (!isDev) return;
    const line = format('DEBUG', ctx, msg, data);
    outputChannel?.appendLine(line);
    console.debug(line);
  },
};
