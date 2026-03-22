import * as fs from 'fs';
import * as path from 'path';
import { writeAtomicText } from './writeAtomic';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'NoteCreator';

/**
 * Создаёт новую Note GMS2:
 *  - notes/{name}/{name}.yy   — метаданные
 *  - notes/{name}/{name}.note — пустой текстовый файл
 *  - Регистрирует в .yyp
 */
export async function createNote(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const noteDir = path.join(projectRoot, 'notes', name);
  const yyPath = path.join(noteDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Note already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMNotes': 'v1',
    '%Name': name,
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    resourceType: 'GMNotes',
    resourceVersion: '2.0',
  };

  try {
    fs.mkdirSync(noteDir, { recursive: true });
    writeGms2Json(yyPath, yyTemplate);
    writeAtomicText(path.join(noteDir, `${name}.note`), '');

    await registerResource(yypPath, {
      name,
      relativePath: `notes/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Note created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create note', { name, error: String(e) });
    try { fs.rmSync(noteDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
