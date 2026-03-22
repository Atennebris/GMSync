/**
 * GMSync Bridge — протокол TCP-коммуникации с запущенной игрой.
 *
 * Формат строк (line-delimited, UTF-8):
 *   Игра → VS Code:  LOG:<timestamp>|<message>\n
 *   VS Code → Игра:  CMD:<id>|<command>\n
 *   Игра → VS Code:  RSP:<id>|<result>\n
 */

/** VS Code подключается к игре на этот порт (GMS2 слушает, VS Code — клиент) */
export const BRIDGE_GAME_PORT = 6503;
export const BRIDGE_HOST      = '127.0.0.1';
export const MAX_LOG_BUFFER = 10_000;
export const CMD_TIMEOUT_MS = 5_000;

/** Имена GMS2-ассетов создаваемых инсталлером */
export const BRIDGE_OBJECT_NAME    = '__gmsync_bridge';
export const BRIDGE_CONNECT_SCRIPT = '_gsb_try_connect';
export const BRIDGE_LOG_SCRIPT     = '__gmsync_log';
export const BRIDGE_EXEC_SCRIPT    = '__gmsync_exec';

export type MessageType = 'LOG' | 'CMD' | 'RSP';

export interface ParsedMessage {
  type:    MessageType;
  id:      string;
  payload: string;
}

/** Парсит одну строку протокола. Возвращает null если строка невалидна. */
export function parseMessage(line: string): ParsedMessage | null {
  const colon = line.indexOf(':');
  if (colon < 0) return null;

  const type = line.slice(0, colon) as MessageType;
  if (type !== 'LOG' && type !== 'CMD' && type !== 'RSP') return null;

  const rest = line.slice(colon + 1);
  const pipe  = rest.indexOf('|');
  if (pipe < 0) return null;

  return { type, id: rest.slice(0, pipe), payload: rest.slice(pipe + 1) };
}

/** Форматирует команду для отправки в игру. */
export function formatCmd(id: string, command: string): string {
  return `CMD:${id}|${command}\n`;
}
