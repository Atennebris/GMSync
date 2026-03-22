import * as fs from 'fs';
import * as path from 'path';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'PathCreator';

/**
 * Создаёт новый Path GMS2:
 *  - paths/{name}/{name}.yy — метаданные с пустым points[]
 *  - Регистрирует в .yyp
 */
export async function createPath(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const pathDir = path.join(projectRoot, 'paths', name);
  const yyPath = path.join(pathDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Path already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMPath': '',
    '%Name': name,
    closed: false,
    kind: 0,
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    points: [{ speed: 100, x: 0, y: 0 }],
    precision: 4,
    resourceType: 'GMPath',
    resourceVersion: '2.0',
  };

  try {
    fs.mkdirSync(pathDir, { recursive: true });
    writeGms2Json(yyPath, yyTemplate);

    await registerResource(yypPath, {
      name,
      relativePath: `paths/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Path created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create path', { name, error: String(e) });
    try { fs.rmSync(pathDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
