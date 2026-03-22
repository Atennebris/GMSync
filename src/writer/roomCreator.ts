import * as fs from 'fs';
import * as path from 'path';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'RoomCreator';

/**
 * Создаёт новую комнату GMS2:
 *  - rooms/{name}/{name}.yy  — минимальный валидный шаблон с Instances + Background слоями
 *  - Регистрирует в .yyp (resources[] + RoomOrderNodes[])
 *
 * Критический факт №10: при создании комнаты — обязательно обновить ОБА массива в .yyp.
 */
export async function createRoom(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const roomDir = path.join(projectRoot, 'rooms', name);
  const yyPath = path.join(roomDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Room already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');

  const template: Record<string, unknown> = {
    '$GMRoom': 'v1',
    '%Name': name,
    creationCodeFile: '',
    inheritCode: false,
    inheritCreationOrder: false,
    inheritLayers: false,
    instanceCreationOrder: [],
    isDnd: false,
    layers: [
      {
        '$GMRInstanceLayer': '',
        '%Name': 'Instances',
        depth: 0,
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
        name: 'Instances',
        properties: [],
        resourceType: 'GMRInstanceLayer',
        resourceVersion: '2.0',
        userdefinedDepth: false,
        visible: true,
      },
      {
        '$GMRBackgroundLayer': '',
        '%Name': 'Background',
        animationFPS: 15,
        animationSpeedType: 0,
        colour: 4278190080,
        depth: 100,
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
        name: 'Background',
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
      },
    ],
    name,
    parent: { name: projectName, path: `${projectName}.yyp` },
    parentRoom: null,
    physicsSettings: {
      inheritPhysicsSettings: false,
      PhysicsWorld: false,
      PhysicsWorldGravityX: 0,
      PhysicsWorldGravityY: 10,
      PhysicsWorldPixToMetres: 0.1,
    },
    resourceType: 'GMRoom',
    resourceVersion: '2.0',
    roomSettings: {
      Height: 768,
      inheritRoomSettings: false,
      persistent: false,
      Width: 1366,
    },
    sequenceId: null,
    views: Array.from({ length: 8 }, () => ({
      hborder: 32, hport: 768, hspeed: -1, hview: 768,
      inherit: false, objectId: null,
      vborder: 32, visible: false, vspeed: -1,
      wport: 1366, wview: 1366,
      xport: 0, xview: 0, yport: 0, yview: 0,
    })),
    viewSettings: {
      clearDisplayBuffer: true,
      clearViewBackground: false,
      enableViews: false,
      inheritViewSettings: false,
    },
    volume: 1,
  };

  try {
    fs.mkdirSync(roomDir, { recursive: true });
    writeGms2Json(yyPath, template);

    await registerResource(yypPath, {
      name,
      relativePath: `rooms/${name}/${name}.yy`,
      isRoom: true,
    });

    logger.info(CTX, 'Room created and registered', { name });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create room', { name, error: String(e) });
    return false;
  }
}
