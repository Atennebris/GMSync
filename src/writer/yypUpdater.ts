import * as crypto from 'crypto';
import { readGms2Json, writeGms2Json } from '../utils/gms2Json';
import { ProjectModel } from '../model/projectModel';
import { logger } from '../utils/logger';

const CTX = 'YypUpdater';

export interface ResourceInfo {
  name: string;
  /** Путь относительно projectRoot, например "objects/obj_player/obj_player.yy" */
  relativePath: string;
  /** true если ресурс — комната (нужно обновить и RoomOrderNodes[]) */
  isRoom?: boolean;
}

/**
 * Регистрирует несколько ресурсов в .yyp одним чтением/записью.
 * Используй вместо нескольких вызовов registerResource() чтобы не триггерить GMS2 reload несколько раз.
 */
export async function registerResourceBatch(
  yypPath: string,
  resources: ResourceInfo[],
): Promise<void> {
  const yyp = readGms2Json(yypPath) as Record<string, unknown>;
  const existing = yyp['resources'] as Array<{ id: { name: string; path: string } }>;
  const roomOrderNodes = (yyp['RoomOrderNodes'] as Array<{ roomId: { name: string; path: string } }>) ?? [];

  for (const resource of resources) {
    if (existing.some(r => r.id?.name === resource.name)) {
      logger.warn(CTX, 'Resource already in .yyp, skipping', { name: resource.name });
      continue;
    }
    existing.push({ id: { name: resource.name, path: resource.relativePath } });
    if (resource.isRoom) {
      roomOrderNodes.push({ roomId: { name: resource.name, path: resource.relativePath } });
    }
    logger.info(CTX, 'Queued resource for batch register', { name: resource.name });
  }

  yyp['RoomOrderNodes'] = roomOrderNodes;
  writeGms2Json(yypPath, yyp);
  logger.info(CTX, 'Batch register complete', { count: resources.length });
}

/**
 * Удаляет несколько ресурсов из .yyp одним чтением/записью.
 */
export async function unregisterResourceBatch(
  yypPath: string,
  names: string[],
): Promise<void> {
  const yyp = readGms2Json(yypPath) as Record<string, unknown>;
  const nameSet = new Set(names);

  yyp['resources'] = (yyp['resources'] as Array<{ id: { name: string } }>)
    .filter(r => !nameSet.has(r.id?.name));

  if (Array.isArray(yyp['RoomOrderNodes'])) {
    yyp['RoomOrderNodes'] = (yyp['RoomOrderNodes'] as Array<{ roomId: { name: string } }>)
      .filter(r => !nameSet.has(r.roomId?.name));
  }

  writeGms2Json(yypPath, yyp);
  logger.info(CTX, 'Batch unregister complete', { names: [...nameSet] });
}

/**
 * Регистрирует новый ресурс в .yyp.
 * При isRoom=true — дополнительно обновляет RoomOrderNodes[].
 */
export async function registerResource(
  yypPath: string,
  resource: ResourceInfo,
): Promise<void> {
  logger.info(CTX, 'Registering resource in .yyp', resource);

  const yyp = readGms2Json(yypPath) as Record<string, unknown>;
  const resources = yyp['resources'] as Array<{ id: { name: string; path: string } }>;

  // Проверка дубликата
  const alreadyExists = resources.some(r => r.id?.name === resource.name);
  if (alreadyExists) {
    logger.warn(CTX, 'Resource already in .yyp, skipping', { name: resource.name });
    return;
  }

  resources.push({ id: { name: resource.name, path: resource.relativePath } });

  if (resource.isRoom) {
    const roomOrderNodes = (yyp['RoomOrderNodes'] as Array<{
      roomId: { name: string; path: string };
    }>) ?? [];
    roomOrderNodes.push({ roomId: { name: resource.name, path: resource.relativePath } });
    yyp['RoomOrderNodes'] = roomOrderNodes;
  }

  writeGms2Json(yypPath, yyp);
  logger.info(CTX, 'Resource registered successfully', { name: resource.name });
}

/**
 * Удаляет ресурс из .yyp (и из RoomOrderNodes если есть).
 */
export async function unregisterResource(yypPath: string, name: string): Promise<void> {
  logger.info(CTX, 'Unregistering resource from .yyp', { name });

  const yyp = readGms2Json(yypPath) as Record<string, unknown>;

  yyp['resources'] = (
    yyp['resources'] as Array<{ id: { name: string } }>
  ).filter(r => r.id?.name !== name);

  if (Array.isArray(yyp['RoomOrderNodes'])) {
    yyp['RoomOrderNodes'] = (
      yyp['RoomOrderNodes'] as Array<{ roomId: { name: string } }>
    ).filter(r => r.roomId?.name !== name);
  }

  writeGms2Json(yypPath, yyp);
  logger.info(CTX, 'Resource unregistered successfully', { name });
}

/**
 * Проверяет уникальность имени ресурса по текущей ProjectModel.
 */
export function isNameUnique(model: ProjectModel, name: string): boolean {
  return !(
    name in model.objects ||
    name in model.scripts ||
    name in model.rooms ||
    name in model.sprites
  );
}

/**
 * Генерирует уникальный Instance ID для GMS2 комнаты.
 * Формат: inst_{8 hex chars uppercase}, например inst_A1B2C3D4.
 */
export function generateInstanceId(): string {
  return `inst_${crypto.randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
}
