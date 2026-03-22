import * as fs from 'fs';
import * as path from 'path';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'FontCreator';

/**
 * Создаёт новый Font GMS2 (stub без glyphs):
 *  - fonts/{name}/{name}.yy — метаданные (Arial 12px, Latin Basic range)
 *  - Регистрирует в .yyp
 *
 * GMS2 покажет шрифт как "требует перегенерации текстуры" — это нормально.
 * Текстуру GMS2 генерирует при первом открытии/компиляции.
 */
export async function createFont(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const fontDir = path.join(projectRoot, 'fonts', name);
  const yyPath = path.join(fontDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Font already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const yyTemplate: Record<string, unknown> = {
    '$GMFont': '',
    '%Name': name,
    AntiAlias: 1,
    applyKerning: 0,
    ascender: 0,
    ascenderOffset: 0,
    bold: false,
    canGenerateBitmap: true,
    charset: 0,
    first: 0,
    fontName: 'Arial',
    glyphOperations: 0,
    glyphs: {},
    hinting: 0,
    includeTTF: false,
    interpreter: 0,
    italic: false,
    kerningPairs: [],
    last: 0,
    lineHeight: 0,
    maintainGms1Font: false,
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    pointRounding: 0,
    ranges: [{ lower: 32, upper: 127 }],
    regenerateBitmap: false,
    resourceType: 'GMFont',
    resourceVersion: '2.0',
    sampleText: 'abcdef ABCDEF',
    sdfSpread: 8,
    size: 12.0,
    styleName: 'Regular',
    textureGroupId: { name: 'Default', path: 'texturegroups/Default' },
    TTFName: '',
    usesSDF: false,
  };

  try {
    fs.mkdirSync(fontDir, { recursive: true });
    writeGms2Json(yyPath, yyTemplate);

    await registerResource(yypPath, {
      name,
      relativePath: `fonts/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Font created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create font', { name, error: String(e) });
    try { fs.rmSync(fontDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
