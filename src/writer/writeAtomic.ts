import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const CTX = 'WriteAtomic';

/** Синхронная пауза через Atomics.wait — работает в main thread Node.js */
function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Атомарная запись строки в файл: пишем во временный .tmp_ файл → rename.
 * Гарантирует что GMS2 никогда не прочитает полуготовый файл при crash.
 * На Windows: retry при EPERM (другой процесс держит файл открытым — напр. Stitch reloading .yyp).
 */
export function writeAtomicText(targetPath: string, content: string): void {
  const tmp = `${targetPath}.tmp_${Date.now()}`;
  try {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(tmp, content, { encoding: 'utf8' });

    // На Windows rename может упасть с EPERM если другой процесс читает целевой файл.
    // Retry 5 раз с паузой 15ms (итого до ~75ms ожидания).
    const MAX_RETRIES = 5;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        fs.renameSync(tmp, targetPath);
        logger.debug(CTX, 'Atomic write ok', { target: path.basename(targetPath) });
        return;
      } catch (renameErr) {
        const code = (renameErr as NodeJS.ErrnoException).code;
        if (code === 'EPERM' && attempt < MAX_RETRIES - 1) {
          logger.debug(CTX, 'Rename EPERM — retry', { attempt: attempt + 1, target: path.basename(targetPath) });
          sleepSync(15);
          continue;
        }
        throw renameErr;
      }
    }
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* уже удалён */ }
    throw e;
  }
}
