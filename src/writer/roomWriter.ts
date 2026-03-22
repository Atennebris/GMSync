import * as path from 'path';
import { readGms2Json, writeGms2Json } from '../utils/gms2Json';
import { generateInstanceId } from './yypUpdater';
import { ProjectModel } from '../model/projectModel';
import { logger } from '../utils/logger';

const CTX = 'RoomWriter';

interface GmsLayer {
  name: string;
  resourceType: string;
  instances?: unknown[];
  [key: string]: unknown;
}

/**
 * Добавляет инстанс объекта в комнату GMS2.
 * Обновляет ДВА места в room .yy (критический факт №5):
 *   1. layers[Instances].instances[] — сам инстанс
 *   2. instanceCreationOrder[]       — порядок создания
 *
 * @param roomYyPath  Абсолютный путь к .yy файлу комнаты
 * @param objName     Имя объекта (например "obj_player")
 * @param x           Координата X
 * @param y           Координата Y
 * @param layerName   Имя слоя инстансов (по умолчанию "Instances")
 */
export function addRoomInstance(
  roomYyPath: string,
  objName: string,
  x: number,
  y: number,
  layerName = 'Instances',
  model?: ProjectModel,
): void {
  // Валидация: объект должен существовать в ProjectModel
  if (model && !(objName in model.objects)) {
    logger.error(CTX, `addRoomInstance: object "${objName}" not found in project — instance NOT added`, { objName });
    return;
  }

  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  const roomName = roomData['name'] as string;
  const roomRelPath = `rooms/${roomName}/${roomName}.yy`;

  // Найти целевой слой инстансов
  const layers = roomData['layers'] as GmsLayer[];
  const layer = layers.find(l => l.name === layerName && l.resourceType === 'GMRInstanceLayer');
  if (!layer) {
    logger.error(CTX, `Instance layer "${layerName}" not found in room`, { roomName, layerName });
    return;
  }

  if (!Array.isArray(layer.instances)) {
    layer.instances = [];
  }

  const instId = generateInstanceId();

  // Запись инстанса — все поля обязательны для GMS2
  const instance: Record<string, unknown> = {
    '$GMRInstance': 'v4',
    '%Name': instId,
    colour: 4294967295,
    frozen: false,
    hasCreationCode: false,
    ignore: false,
    imageIndex: 0,
    imageSpeed: 1.0,
    inheritCode: false,
    inheritedItemId: null,
    inheritItemSettings: false,
    isDnd: false,
    name: instId,
    objectId: {
      name: objName,
      path: `objects/${objName}/${objName}.yy`,
    },
    properties: [],
    resourceType: 'GMRInstance',
    resourceVersion: '2.0',
    rotation: 0.0,
    scaleX: 1.0,
    scaleY: 1.0,
    x,
    y,
  };

  layer.instances.push(instance);

  // instanceCreationOrder — порядок вызова Create event при запуске комнаты
  const creationOrder = (roomData['instanceCreationOrder'] as unknown[]) ?? [];
  creationOrder.push({ name: instId, path: roomRelPath });
  roomData['instanceCreationOrder'] = creationOrder;

  writeGms2Json(roomYyPath, roomData);
  logger.info(CTX, 'Instance added to room', { roomName, objName, instId, x, y, layerName });
}

/**
 * Удаляет все инстансы указанного объекта из комнаты GMS2.
 * Обновляет ДВА места: layers[x].instances[] и instanceCreationOrder[].
 *
 * @returns Количество удалённых инстансов
 */
export function removeObjectInstancesFromRoom(
  roomYyPath: string,
  objectName: string,
): number {
  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  const roomName = roomData['name'] as string;

  let removed = 0;
  const removedInstIds = new Set<string>();

  // Фильтруем инстансы во всех слоях типа GMRInstanceLayer
  const layers = (roomData['layers'] as GmsLayer[]) ?? [];
  for (const layer of layers) {
    if (layer.resourceType !== 'GMRInstanceLayer' || !Array.isArray(layer.instances)) continue;

    const before = layer.instances.length;
    layer.instances = layer.instances.filter((inst: unknown) => {
      const i = inst as Record<string, unknown>;
      const objId = i['objectId'] as Record<string, unknown> | null;
      if (objId && objId['name'] === objectName) {
        removedInstIds.add(i['name'] as string);
        return false;
      }
      return true;
    });
    removed += before - layer.instances.length;
  }

  if (removed === 0) return 0;

  // Чистим instanceCreationOrder от удалённых ID
  const creationOrder = (roomData['instanceCreationOrder'] as Array<Record<string, unknown>>) ?? [];
  roomData['instanceCreationOrder'] = creationOrder.filter(
    entry => !removedInstIds.has(entry['name'] as string),
  );

  writeGms2Json(roomYyPath, roomData);
  logger.info(CTX, 'Removed stale instances from room', { roomName, objectName, removed });
  return removed;
}

/**
 * Возвращает путь к .yy файлу комнаты по её имени.
 */
export function getRoomYyPath(projectRoot: string, roomName: string): string {
  return path.join(projectRoot, 'rooms', roomName, `${roomName}.yy`);
}
