import * as fs from 'fs';
import * as path from 'path';
import { readGms2Json } from '../utils/gms2Json';
import {
  ProjectModel,
  createEmptyModel,
  ObjectMeta,
  EventInfo,
  EVENT_TYPE_NAME,
  GenericResourceKey,
} from '../model/projectModel';
import { logger } from '../utils/logger';

const CTX = 'ProjectParser';

type ResourceType = 'objects' | 'scripts' | 'rooms' | GenericResourceKey | 'unknown';

// Маппинг префикса пути → ключ модели
const PATH_PREFIX_MAP: Array<[string, ResourceType]> = [
  ['objects/',    'objects'],
  ['scripts/',    'scripts'],
  ['rooms/',      'rooms'],
  ['sprites/',    'sprites'],
  ['shaders/',    'shaders'],
  ['timelines/',  'timelines'],
  ['sounds/',     'sounds'],
  ['fonts/',      'fonts'],
  ['paths/',      'paths'],
  ['sequences/',  'sequences'],
  ['tilesets/',   'tilesets'],
  ['animcurves/', 'animcurves'],
  ['extensions/', 'extensions'],
  ['particles/',  'particles'],
  ['notes/',      'notes'],
];

function getResourceType(resourcePath: string): ResourceType {
  const p = resourcePath.replace(/\\/g, '/');
  for (const [prefix, type] of PATH_PREFIX_MAP) {
    if (p.startsWith(prefix)) return type;
  }
  return 'unknown';
}

/**
 * Парсит eventList[] из .yy объекта и возвращает массив EventInfo.
 */
function parseObjectEvents(yyData: Record<string, unknown>): EventInfo[] {
  const eventList = yyData['eventList'];
  if (!Array.isArray(eventList)) return [];

  return eventList.map((e: Record<string, unknown>) => {
    const eventType = (e['eventType'] as number) ?? 0;
    const eventNum = (e['eventNum'] as number) ?? 0;
    let gmlFile: string;
    let collisionObjectId: string | undefined;

    if (eventType === 4) {
      // Collision — имя файла содержит имя объекта, а не число
      const colObj = (e['collisionObjectId'] as Record<string, string> | null)?.name ?? 'unknown';
      gmlFile = `Collision_${colObj}.gml`;
      collisionObjectId = colObj;
    } else {
      const typeName = EVENT_TYPE_NAME[eventType] ?? `Event${eventType}`;
      gmlFile = `${typeName}_${eventNum}.gml`;
    }

    return { eventType, eventNum, gmlFile, collisionObjectId };
  });
}

function parseObjectResource(
  model: ProjectModel,
  name: string,
  absYyPath: string,
): void {
  const dir = path.dirname(absYyPath);
  const yyRelPath = path.relative(model.projectRoot, absYyPath).replace(/\\/g, '/');

  let yyData: Record<string, unknown>;
  try {
    yyData = readGms2Json(absYyPath) as Record<string, unknown>;
  } catch (e) {
    logger.error(CTX, 'Failed to parse object .yy', { name, error: String(e) });
    return;
  }

  // Фильтр ghost-событий: eventList[] может иметь запись без .gml на диске
  // (например после ручного удаления файла). Показываем только реально существующие.
  const events = parseObjectEvents(yyData).filter(ev =>
    fs.existsSync(path.join(dir, ev.gmlFile)),
  );

  const gmlFiles: string[] = fs.existsSync(dir)
    ? fs.readdirSync(dir)
        .filter(f => f.endsWith('.gml'))
        .map(f => path.relative(model.projectRoot, path.join(dir, f)).replace(/\\/g, '/'))
    : [];

  const spriteId = yyData['spriteId'] as Record<string, string> | null;
  const parentObjectId = yyData['parentObjectId'] as Record<string, string> | null;

  model.objects[name] = {
    name,
    yyPath: yyRelPath,
    gmlFiles,
    events,
    sprite: spriteId?.name,
    parentObject: parentObjectId?.name,
  };
}

function parseScriptResource(
  model: ProjectModel,
  name: string,
  absYyPath: string,
): void {
  const dir = path.dirname(absYyPath);
  const gmlPath = path
    .relative(model.projectRoot, path.join(dir, `${name}.gml`))
    .replace(/\\/g, '/');

  model.scripts[name] = {
    name,
    yyPath: path.relative(model.projectRoot, absYyPath).replace(/\\/g, '/'),
    gmlPath,
  };
}

/**
 * Читает .yyp и все .yy ресурсов, строит in-memory ProjectModel.
 */
export async function parseProject(yypPath: string): Promise<ProjectModel> {
  const projectRoot = path.dirname(yypPath);
  const model = createEmptyModel(projectRoot, yypPath);

  let yyp: Record<string, unknown>;
  try {
    yyp = readGms2Json(yypPath) as Record<string, unknown>;
  } catch (e) {
    logger.error(CTX, 'Failed to parse .yyp', { yypPath, error: String(e) });
    return model;
  }

  const resources = (yyp['resources'] as Array<{ id: { name: string; path: string } }>) ?? [];

  for (const res of resources) {
    const { name, path: resPath } = res.id;
    const type = getResourceType(resPath);
    const absYyPath = path.join(projectRoot, resPath);

    if (!fs.existsSync(absYyPath)) {
      logger.warn(CTX, '.yy file not found, skipping', { name, path: resPath });
      continue;
    }

    const relPath = resPath.replace(/\\/g, '/');
    switch (type) {
      case 'objects':
        parseObjectResource(model, name, absYyPath);
        break;
      case 'scripts':
        parseScriptResource(model, name, absYyPath);
        break;
      case 'rooms':
        model.rooms[name] = { name, yyPath: relPath };
        break;
      case 'unknown':
        logger.debug(CTX, 'Skipping unknown resource type', { name, path: resPath });
        break;
      default:
        // Все Generic типы: sprites, shaders, timelines, sounds, fonts, paths,
        // sequences, tilesets, animcurves, extensions, particles, notes
        model[type as GenericResourceKey][name] = { name, yyPath: relPath };
    }
  }

  logger.info(CTX, 'Project parsed', {
    objects:   Object.keys(model.objects).length,
    scripts:   Object.keys(model.scripts).length,
    rooms:     Object.keys(model.rooms).length,
    sprites:   Object.keys(model.sprites).length,
    shaders:   Object.keys(model.shaders).length,
    timelines: Object.keys(model.timelines).length,
    sounds:    Object.keys(model.sounds).length,
    fonts:     Object.keys(model.fonts).length,
  });

  return model;
}

/**
 * Определяет тип и номер события по имени .gml файла.
 * Возвращает null если имя не соответствует ни одному паттерну.
 */
export function parseEventFileName(
  filename: string,
): { eventType: number; eventNum: number; collisionObjName?: string } | null {
  const base = path.basename(filename, '.gml');

  // Collision: Collision_ObjName
  const collMatch = base.match(/^Collision_(.+)$/);
  if (collMatch) {
    return { eventType: 4, eventNum: 0, collisionObjName: collMatch[1] };
  }

  // Обычные и sub-типы: TypeName_Num
  const regularMatch = base.match(/^([A-Za-z]+)_(\d+)$/);
  if (regularMatch) {
    const typeName = regularMatch[1];
    const eventNum = parseInt(regularMatch[2], 10);
    for (const [typeStr, name] of Object.entries(EVENT_TYPE_NAME)) {
      if (name === typeName) {
        return { eventType: parseInt(typeStr, 10), eventNum };
      }
    }
  }

  return null;
}
