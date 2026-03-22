import { readGms2Json, writeGms2Json } from '../utils/gms2Json';
import { logger } from '../utils/logger';

const CTX = 'RoomLayerManager';

export type LayerType = 'GMRInstanceLayer' | 'GMRBackgroundLayer';

interface GmsLayer {
  name: string;
  resourceType: string;
  [key: string]: unknown;
}

// ── Шаблоны слоёв (структура взята из реального GMS2 2024.x .yy файла) ───────

function buildInstanceLayer(layerName: string, depth: number): Record<string, unknown> {
  return {
    '$GMRInstanceLayer': '',
    '%Name': layerName,
    depth,
    effectEnabled: true,
    effectType: null,
    gridX: 32,
    gridY: 32,
    hierarchyFrozen: false,
    inheritLayerDepth: false,
    inheritLayerSettings: false,
    inheritSubLayers: true,
    inheritVisibility: true,
    instances: [],
    layers: [],
    name: layerName,
    properties: [],
    resourceType: 'GMRInstanceLayer',
    resourceVersion: '2.0',
    userdefinedDepth: false,
    visible: true,
  };
}

function buildBackgroundLayer(
  layerName: string,
  depth: number,
  colour = 4278190080, // 0xFF000000 — чёрный
): Record<string, unknown> {
  return {
    '$GMRBackgroundLayer': '',
    '%Name': layerName,
    animationFPS: 15,
    animationSpeedType: 0,
    colour,
    depth,
    effectEnabled: true,
    effectType: null,
    gridX: 32,
    gridY: 32,
    hierarchyFrozen: false,
    hspeed: 0,
    htiled: false,
    inheritLayerDepth: false,
    inheritLayerSettings: false,
    inheritSubLayers: true,
    inheritVisibility: true,
    layers: [],
    name: layerName,
    properties: [],
    resourceType: 'GMRBackgroundLayer',
    resourceVersion: '2.0',
    spriteId: null,
    stretch: false,
    userdefinedAnimFPS: false,
    userdefinedDepth: false,
    visible: true,
    vspeed: 0,
    vtiled: false,
    x: 0,
    y: 0,
  };
}

// ── Публичные функции ─────────────────────────────────────────────────────────

/**
 * Добавляет новый пустой слой в комнату.
 * @param roomYyPath Абсолютный путь к .yy файлу комнаты
 * @param layerName  Имя нового слоя
 * @param layerType  Тип: 'GMRInstanceLayer' | 'GMRBackgroundLayer'
 * @param depth      Глубина слоя (больше = дальше)
 * @param colour     ARGB uint32 для Background слоя (по умолчанию чёрный)
 */
export function addLayer(
  roomYyPath: string,
  layerName: string,
  layerType: LayerType,
  depth: number,
  colour?: number,
): boolean {
  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  const roomName = roomData['name'] as string;
  const layers = (roomData['layers'] as GmsLayer[]) ?? [];

  if (layers.find(l => l.name === layerName)) {
    logger.error(CTX, `Layer "${layerName}" already exists in room "${roomName}"`);
    return false;
  }

  const newLayer = layerType === 'GMRInstanceLayer'
    ? buildInstanceLayer(layerName, depth)
    : buildBackgroundLayer(layerName, depth, colour);

  layers.push(newLayer as unknown as GmsLayer);
  roomData['layers'] = layers;
  writeGms2Json(roomYyPath, roomData);
  logger.info(CTX, `Layer "${layerName}" (${layerType}) added to room "${roomName}"`, { depth });
  return true;
}

/**
 * Удаляет слой из комнаты по имени.
 * ⚠️ Если слой GMRInstanceLayer содержит инстансы — они тоже удаляются (instanceCreationOrder очищается).
 */
export function removeLayer(roomYyPath: string, layerName: string): boolean {
  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  const roomName = roomData['name'] as string;
  const layers = (roomData['layers'] as GmsLayer[]) ?? [];

  const idx = layers.findIndex(l => l.name === layerName);
  if (idx === -1) {
    logger.error(CTX, `Layer "${layerName}" not found in room "${roomName}"`);
    return false;
  }

  // Если Instance-слой — убираем инстансы из instanceCreationOrder
  const layer = layers[idx];
  if (layer.resourceType === 'GMRInstanceLayer' && Array.isArray(layer['instances'])) {
    const removedIds = new Set(
      (layer['instances'] as Array<Record<string, unknown>>).map(i => i['name'] as string),
    );
    const order = (roomData['instanceCreationOrder'] as Array<Record<string, unknown>>) ?? [];
    roomData['instanceCreationOrder'] = order.filter(e => !removedIds.has(e['name'] as string));
  }

  layers.splice(idx, 1);
  roomData['layers'] = layers;
  writeGms2Json(roomYyPath, roomData);
  logger.info(CTX, `Layer "${layerName}" removed from room "${roomName}"`);
  return true;
}

/**
 * Меняет фоновый цвет Background-слоя.
 * @param colour ARGB uint32: 4278190080 = чёрный, 4294967295 = белый
 */
export function setBackgroundColour(roomYyPath: string, layerName: string, colour: number): boolean {
  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  const roomName = roomData['name'] as string;
  const layers = (roomData['layers'] as GmsLayer[]) ?? [];

  const layer = layers.find(l => l.name === layerName && l.resourceType === 'GMRBackgroundLayer');
  if (!layer) {
    logger.error(CTX, `Background layer "${layerName}" not found in room "${roomName}"`);
    return false;
  }

  layer['colour'] = colour;
  writeGms2Json(roomYyPath, roomData);
  logger.info(CTX, `BG colour set`, { roomName, layerName, colour });
  return true;
}

/**
 * Устанавливает спрайт как фон для Background-слоя.
 * @param spriteName Имя спрайта (например 'spr_bg') или null чтобы убрать спрайт
 */
export function setBackgroundSprite(
  roomYyPath: string,
  layerName: string,
  spriteName: string | null,
): boolean {
  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  const roomName = roomData['name'] as string;
  const layers = (roomData['layers'] as GmsLayer[]) ?? [];

  const layer = layers.find(l => l.name === layerName && l.resourceType === 'GMRBackgroundLayer');
  if (!layer) {
    logger.error(CTX, `Background layer "${layerName}" not found in room "${roomName}"`);
    return false;
  }

  layer['spriteId'] = spriteName
    ? { name: spriteName, path: `sprites/${spriteName}/${spriteName}.yy` }
    : null;

  writeGms2Json(roomYyPath, roomData);
  logger.info(CTX, `BG sprite set`, { roomName, layerName, spriteName });
  return true;
}

/**
 * Возвращает список слоёв комнаты для отображения в Command Palette.
 */
export function getRoomLayers(roomYyPath: string): GmsLayer[] {
  const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
  return (roomData['layers'] as GmsLayer[]) ?? [];
}

/**
 * Парсит цвет из строки пользователя.
 * Поддерживает: '#RRGGBB', '#AARRGGBB', decimal
 * Возвращает ARGB uint32 или null если невалидно.
 */
export function parseColourInput(input: string): number | null {
  const hex6 = input.match(/^#?([0-9A-Fa-f]{6})$/);
  if (hex6) {
    // #RRGGBB → 0xFF + RGB — конвертация в беззнаковый uint32
    return (0xFF000000 | parseInt(hex6[1], 16)) >>> 0;
  }
  const hex8 = input.match(/^#?([0-9A-Fa-f]{8})$/);
  if (hex8) {
    return parseInt(hex8[1], 16) >>> 0;
  }
  const dec = parseInt(input, 10);
  if (!isNaN(dec) && dec >= 0) return dec >>> 0;
  return null;
}
