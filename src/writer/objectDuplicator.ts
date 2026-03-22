import * as fs from 'fs';
import * as path from 'path';
import { writeGms2Json, readGms2Json } from '../utils/gms2Json';
import { writeAtomicText } from './writeAtomic';
import { registerResource } from './yypUpdater';
import { ProjectModel } from '../model/projectModel';
import { logger } from '../utils/logger';

const CTX = 'ObjectDuplicator';

/**
 * Дублирует объект GMS2:
 *  1. Копирует все .gml файлы из src в новую папку
 *  2. Создаёт {newName}.yy на основе srcName.yy (меняет name/path references)
 *  3. Регистрирует новый объект в .yyp
 *  4. GMS2 увидит новый объект после rescanPing
 *
 * По паттерну polats/gms2-mcp-server.
 */
export async function duplicateObject(
  projectRoot: string,
  yypPath: string,
  model: ProjectModel,
  srcName: string,
  newName: string,
): Promise<boolean> {
  const src = model.objects[srcName];
  if (!src) {
    logger.error(CTX, 'Source object not found', { srcName });
    return false;
  }

  if (newName in model.objects) {
    logger.error(CTX, 'Target name already exists', { newName });
    return false;
  }

  const srcDir = path.join(projectRoot, 'objects', srcName);
  const dstDir = path.join(projectRoot, 'objects', newName);

  if (fs.existsSync(dstDir)) {
    logger.warn(CTX, 'Target directory already exists', { dstDir });
    return false;
  }

  try {
    fs.mkdirSync(dstDir, { recursive: true });

    // Копируем .gml файлы (события) без изменений
    for (const gmlRel of src.gmlFiles) {
      const srcGml = path.join(projectRoot, gmlRel);
      const gmlFileName = path.basename(srcGml);
      const dstGml = path.join(dstDir, gmlFileName);

      if (fs.existsSync(srcGml)) {
        const code = fs.readFileSync(srcGml, 'utf8');
        writeAtomicText(dstGml, code);
      }
    }

    // Читаем .yy источника и клонируем с новым именем
    const srcYyPath = path.join(projectRoot, src.yyPath);
    const yyData = readGms2Json(srcYyPath) as Record<string, unknown>;

    yyData['%Name'] = newName;
    yyData['name'] = newName;
    // parent оставляем как есть — новый объект попадёт в ту же папку ресурса
    // eventList оставляем — события те же, .gml файлы уже скопированы

    const dstYyPath = path.join(dstDir, `${newName}.yy`);
    writeGms2Json(dstYyPath, yyData);

    await registerResource(yypPath, {
      name: newName,
      relativePath: `objects/${newName}/${newName}.yy`,
    });

    logger.info(CTX, 'Object duplicated', { srcName, newName });
    return true;
  } catch (e) {
    logger.error(CTX, 'Duplicate failed', { srcName, newName, error: String(e) });
    // Cleanup partial state
    try { fs.rmSync(dstDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
