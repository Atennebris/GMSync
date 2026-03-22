import * as fs from 'fs';
import * as path from 'path';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'SequenceCreator';

/**
 * Создаёт новый Sequence GMS2:
 *  - sequences/{name}/{name}.yy — метаданные с пустыми tracks[]
 *  - Регистрирует в .yyp
 */
export async function createSequence(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const seqDir = path.join(projectRoot, 'sequences', name);
  const yyPath = path.join(seqDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Sequence already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMSequence': 'v1',
    '%Name': name,
    autoRecord: true,
    backdropHeight: 768,
    backdropImageOpacity: 0.5,
    backdropImagePath: '',
    backdropWidth: 1366,
    backdropXOffset: 0.0,
    backdropYOffset: 0.0,
    events: {
      '$KeyframeStore<MessageEventKeyframe>': '',
      Keyframes: [],
      resourceType: 'KeyframeStore<MessageEventKeyframe>',
      resourceVersion: '2.0',
    },
    eventStubScript: null,
    eventToFunction: {},
    length: 1.0,
    lockOrigin: false,
    moments: {
      '$KeyframeStore<MomentsEventKeyframe>': '',
      Keyframes: [],
      resourceType: 'KeyframeStore<MomentsEventKeyframe>',
      resourceVersion: '2.0',
    },
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    playback: 0,
    playbackSpeed: 30.0,
    playbackSpeedType: 0,
    resourceType: 'GMSequence',
    resourceVersion: '2.0',
    showBackdrop: true,
    showBackdropImage: false,
    spriteId: null,
    timeUnits: 1,
    tracks: [],
    visibleRange: null,
    volume: 1.0,
    xorigin: 0,
    yorigin: 0,
  };

  try {
    fs.mkdirSync(seqDir, { recursive: true });
    writeGms2Json(yyPath, yyTemplate);

    await registerResource(yypPath, {
      name,
      relativePath: `sequences/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Sequence created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create sequence', { name, error: String(e) });
    try { fs.rmSync(seqDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
