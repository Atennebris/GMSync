import * as fs from 'fs';
import * as path from 'path';
import { writeAtomicText } from './writeAtomic';
import { readGms2Json, writeGms2Json } from '../utils/gms2Json';
import { ProjectModel, EVENT_TYPE_NAME } from '../model/projectModel';
import { logger } from '../utils/logger';

const CTX = 'GmlWriter';

/**
 * Записывает GML код в событие объекта (atomic write).
 * Если событие новое — добавляет запись в eventList[] объектного .yy.
 * Orchestrator's FS watcher тоже отреагирует, но здесь мы делаем это синхронно
 * чтобы не ждать debounce.
 *
 * @returns true если успешно
 */
export function modifyEvent(
  projectRoot: string,
  model: ProjectModel,
  objName: string,
  eventType: number,
  eventNum: number,
  gmlCode: string,
  collisionObjName?: string,
): boolean {
  const obj = model.objects[objName];
  if (!obj) {
    logger.error(CTX, 'modifyEvent: object not found', { objName });
    return false;
  }

  const typeName = EVENT_TYPE_NAME[eventType] ?? `Event${eventType}`;
  // Collision: имя файла = Collision_{objName}.gml, НЕ Collision_0.gml
  const gmlFileName = (eventType === 4 && collisionObjName)
    ? `Collision_${collisionObjName}.gml`
    : `${typeName}_${eventNum}.gml`;
  const gmlPath = path.join(projectRoot, 'objects', objName, gmlFileName);

  try {
    writeAtomicText(gmlPath, gmlCode);
    logger.info(CTX, 'GML written', { objName, gmlFileName });
  } catch (e) {
    logger.error(CTX, 'Failed to write GML', { objName, gmlFileName, error: String(e) });
    return false;
  }

  // Если события нет в eventList — добавляем запись в .yy (не ждём watcher)
  const already = obj.events.some(ev => {
    if (eventType === 4 && collisionObjName) {
      return ev.eventType === 4 && ev.collisionObjectId === collisionObjName;
    }
    return ev.eventType === eventType && ev.eventNum === eventNum;
  });
  if (!already) {
    const yyPath = path.join(projectRoot, obj.yyPath);
    try {
      appendEventEntry(yyPath, eventType, eventNum, collisionObjName);
      logger.info(CTX, 'New event added to eventList', { objName, gmlFileName });
    } catch (e) {
      logger.error(CTX, 'Failed to update eventList', { objName, error: String(e) });
      return false;
    }
  }

  return true;
}

function appendEventEntry(yyPath: string, eventType: number, eventNum: number, collisionObjName?: string): void {
  const yyData = readGms2Json(yyPath) as Record<string, unknown>;
  if (!Array.isArray(yyData['eventList'])) yyData['eventList'] = [];
  (yyData['eventList'] as unknown[]).push({
    '$GMEvent': 'v1',
    '%Name': '',
    collisionObjectId: (eventType === 4 && collisionObjName)
      ? { name: collisionObjName, path: `objects/${collisionObjName}/${collisionObjName}.yy` }
      : null,
    eventNum,
    eventType,
    isDnD: false,
    name: '',
    resourceType: 'GMEvent',
    resourceVersion: '2.0',
  });
  writeGms2Json(yyPath, yyData);
}

/**
 * Записывает произвольный .gml файл.
 * Safety check: путь должен быть .gml и строго внутри projectRoot.
 *
 * @param projectRoot абсолютный путь к папке проекта
 * @param relativePath относительный путь, например "objects/obj_player/Step_0.gml"
 * @returns true если успешно
 */
export function writeGmlFile(
  projectRoot: string,
  relativePath: string,
  content: string,
): boolean {
  if (!relativePath.endsWith('.gml')) {
    logger.error(CTX, 'writeGmlFile: not a .gml extension', { relativePath });
    return false;
  }

  const absPath = path.resolve(projectRoot, relativePath);
  const root = path.resolve(projectRoot);

  if (!absPath.startsWith(root + path.sep) && absPath !== root) {
    logger.error(CTX, 'writeGmlFile: path escapes project root (security)', { relativePath });
    return false;
  }

  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    writeAtomicText(absPath, content);
    logger.info(CTX, 'GML file written', { relativePath });
    return true;
  } catch (e) {
    logger.error(CTX, 'writeGmlFile failed', { relativePath, error: String(e) });
    return false;
  }
}
