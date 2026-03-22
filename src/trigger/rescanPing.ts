import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const CTX = 'RescanPing';
const PING_DIR = '_rescan_ping';
const PING_DEBOUNCE_MS = 500;
const PING_HOLD_MS = 200;

let lastPingTime = 0;
let pendingPing: ReturnType<typeof setTimeout> | undefined;

/**
 * Variant A: создаёт и удаляет папку _rescan_ping/ внутри проекта.
 * GMS2 детектирует FS-изменение и делает rescan Resource Tree.
 * Debounced — не чаще 1 раза в 500ms.
 */
export function triggerRescan(projectRoot: string): void {
  const now = Date.now();
  const timeSinceLast = now - lastPingTime;

  if (pendingPing !== undefined) clearTimeout(pendingPing);

  const delay = timeSinceLast < PING_DEBOUNCE_MS ? PING_DEBOUNCE_MS - timeSinceLast : 0;

  pendingPing = setTimeout(() => {
    pendingPing = undefined;
    lastPingTime = Date.now();
    performPing(projectRoot);
  }, delay);
}

function performPing(projectRoot: string): void {
  const pingPath = path.join(projectRoot, PING_DIR);

  try {
    fs.mkdirSync(pingPath, { recursive: false });
    logger.debug(CTX, 'Ping folder created', { pingPath });

    setTimeout(() => {
      try {
        fs.rmdirSync(pingPath);
        logger.debug(CTX, 'Ping folder removed — GMS2 rescan triggered');
      } catch (e) {
        // Папка могла быть удалена GMS2 сама
        logger.warn(CTX, 'Failed to remove ping folder', { error: String(e) });
      }
    }, PING_HOLD_MS);
  } catch (e) {
    logger.warn(CTX, 'Failed to create ping folder', { pingPath, error: String(e) });
  }
}
