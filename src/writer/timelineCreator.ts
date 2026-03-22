import * as fs from 'fs';
import * as path from 'path';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'TimelineCreator';

/**
 * Создаёт новый Timeline GMS2:
 *  - timelines/{name}/{name}.yy  — шаблон с пустым momentList[]
 *  - Регистрирует в .yyp
 */
export async function createTimeline(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const timelineDir = path.join(projectRoot, 'timelines', name);
  const yyPath = path.join(timelineDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Timeline already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMTimeline': '',
    '%Name': name,
    momentList: [],
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    resourceType: 'GMTimeline',
    resourceVersion: '2.0',
  };

  try {
    fs.mkdirSync(timelineDir, { recursive: true });
    writeGms2Json(yyPath, yyTemplate);

    await registerResource(yypPath, {
      name,
      relativePath: `timelines/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Timeline created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create timeline', { name, error: String(e) });
    try { fs.rmSync(timelineDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
