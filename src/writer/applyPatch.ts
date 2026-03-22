import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../utils/logger';

const CTX = 'ApplyPatch';

export interface FilePatch {
  /** Абсолютный путь к целевому файлу */
  absolutePath: string;
  /** Готовое содержимое (уже отформатированное) */
  content: string;
}

export interface PatchResult {
  success: boolean;
  appliedFiles: string[];
  error?: Error;
}

/**
 * Применяет набор изменений к файлам через staging (batch atomic apply).
 *
 * Алгоритм:
 * 1. Staging: записываем ВСЕ файлы как .tmp_ копии рядом с целями
 * 2. Если staging прошёл — apply: rename каждого .tmp_ → target (атомарная операция ОС)
 * 3. При ошибке на staging — cleanup всех .tmp_, ничего не тронуто
 * 4. При ошибке на apply — cleanup оставшихся .tmp_, логируем partial state
 */
export async function applyPatch(patches: FilePatch[]): Promise<PatchResult> {
  if (patches.length === 0) {
    return { success: true, appliedFiles: [] };
  }

  const ts = Date.now();
  const staged: Array<{ tmp: string; target: string }> = [];

  // ── Шаг 1: staging ───────────────────────────────────────────────────────
  try {
    for (const patch of patches) {
      const tmp = `${patch.absolutePath}.tmp_${ts}`;
      fs.mkdirSync(path.dirname(patch.absolutePath), { recursive: true });
      fs.writeFileSync(tmp, patch.content, { encoding: 'utf8' });
      staged.push({ tmp, target: patch.absolutePath });
    }
  } catch (e) {
    cleanupTmpFiles(staged.map(s => s.tmp));
    const err = toError(e);
    logger.error(CTX, 'Staging failed — all changes rolled back', { error: err.message });
    return { success: false, appliedFiles: [], error: err };
  }

  // ── Шаг 2: apply (rename tmp → target) ───────────────────────────────────
  const applied: string[] = [];
  try {
    for (const { tmp, target } of staged) {
      fs.renameSync(tmp, target);
      applied.push(target);
    }
    logger.info(CTX, 'Patch applied successfully', { count: applied.length });
    return { success: true, appliedFiles: applied };
  } catch (e) {
    // Откатить уже применённые нельзя без git snapshot (Phase 3)
    // Cleanup оставшихся .tmp_ файлов
    const notApplied = staged.filter(s => !applied.includes(s.target)).map(s => s.tmp);
    cleanupTmpFiles(notApplied);
    const err = toError(e);
    logger.error(CTX, 'Apply failed mid-way — partial state, use git rollback', {
      applied,
      error: err.message,
    });
    return { success: false, appliedFiles: applied, error: err };
  }
}

function cleanupTmpFiles(tmpPaths: string[]): void {
  for (const tmp of tmpPaths) {
    try { fs.unlinkSync(tmp); } catch { /* уже нет */ }
  }
}

function toError(e: unknown): Error {
  return e instanceof Error ? e : new Error(String(e));
}
