import * as fs from 'fs';
import * as path from 'path';
import { writeAtomicText } from './writeAtomic';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'ScriptCreator';

/**
 * Создаёт новый скрипт GMS2:
 *  - scripts/{name}/{name}.gml  — с начальным кодом
 *  - scripts/{name}/{name}.yy   — шаблон
 *  - Регистрирует в .yyp
 */
export async function createScript(
  projectRoot: string,
  yypPath: string,
  name: string,
  gmlCode = '// Script\n',
): Promise<boolean> {
  const scriptDir = path.join(projectRoot, 'scripts', name);
  const gmlPath = path.join(scriptDir, `${name}.gml`);
  const yyPath = path.join(scriptDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Script already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMScript': '',
    '%Name': name,
    isCompatibility: false,
    isDnD: false,
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    resourceType: 'GMScript',
    resourceVersion: '2.0',
  };

  try {
    fs.mkdirSync(scriptDir, { recursive: true });
    writeAtomicText(gmlPath, gmlCode);
    writeGms2Json(yyPath, yyTemplate);

    await registerResource(yypPath, {
      name,
      relativePath: `scripts/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Script created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create script', { name, error: String(e) });
    return false;
  }
}
