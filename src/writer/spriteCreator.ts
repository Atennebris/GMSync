import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { writeGms2Json } from '../utils/gms2Json';
import { registerResource } from './yypUpdater';
import { logger } from '../utils/logger';

const CTX = 'SpriteCreator';

/** CRC32 для генерации PNG чанков */
function crc32(buf: Buffer): number {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[i] = c;
  }
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeB = Buffer.from(type, 'ascii');
  const lenB = Buffer.allocUnsafe(4); lenB.writeUInt32BE(data.length, 0);
  const crcB = Buffer.allocUnsafe(4); crcB.writeUInt32BE(crc32(Buffer.concat([typeB, data])), 0);
  return Buffer.concat([lenB, typeB, data, crcB]);
}

/** 1×1 прозрачный PNG-пустышка (RGBA 8-bit, 68 байт) */
function makeTransparentPng1x1(): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.from([0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0]);
  const raw  = Buffer.from([0, 0, 0, 0, 0]); // filter=None + RGBA(0,0,0,0)
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

/**
 * Создаёт новый Sprite GMS2 с одним прозрачным 1×1 кадром:
 *  - sprites/{name}/{name}.yy — метаданные
 *  - sprites/{name}/{frameUUID}.png — composite frame image
 *  - sprites/{name}/layers/{frameUUID}/{layerUUID}.png — layer image
 *  - Регистрирует в .yyp
 *
 * GMS2 откроет спрайт как 1×1 пустой — пользователь меняет размер/добавляет кадры в IDE.
 */
export async function createSprite(
  projectRoot: string,
  yypPath: string,
  name: string,
): Promise<boolean> {
  const spriteDir = path.join(projectRoot, 'sprites', name);
  const yyPath = path.join(spriteDir, `${name}.yy`);

  if (fs.existsSync(yyPath)) {
    logger.warn(CTX, 'Sprite already exists', { name });
    return false;
  }

  const projectName = path.basename(yypPath, '.yyp');
  const frameUuid    = crypto.randomUUID();
  const layerUuid    = crypto.randomUUID();
  const keyframeUuid = crypto.randomUUID();
  const spritePath = `sprites/${name}/${name}.yy`;

  const yyTemplate: Record<string, unknown> = {
    '$GMSprite': 'v2',
    '%Name': name,
    bboxMode: 0,
    bbox_bottom: 0,
    bbox_left: 0,
    bbox_right: 0,
    bbox_top: 0,
    collisionKind: 1,
    collisionTolerance: 0,
    DynamicTexturePage: false,
    edgeFiltering: false,
    For3D: false,
    frames: [
      {
        '$GMSpriteFrame': 'v1',
        '%Name': frameUuid,
        name: frameUuid,
        resourceType: 'GMSpriteFrame',
        resourceVersion: '2.0',
      },
    ],
    gridX: 0,
    gridY: 0,
    height: 1,
    HTile: false,
    layers: [
      {
        '$GMImageLayer': '',
        '%Name': layerUuid,
        blendMode: 0,
        displayName: 'default',
        isLocked: false,
        name: layerUuid,
        opacity: 100.0,
        resourceType: 'GMImageLayer',
        resourceVersion: '2.0',
        visible: true,
      },
    ],
    name,
    nineSlice: null,
    origin: 0,
    parent: { name: projectName, path: `${projectName}.yyp` },
    preMultiplyAlpha: false,
    resourceType: 'GMSprite',
    resourceVersion: '2.0',
    sequence: {
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
      playback: 1,
      playbackSpeed: 30.0,
      playbackSpeedType: 0,
      resourceType: 'GMSequence',
      resourceVersion: '2.0',
      showBackdrop: true,
      showBackdropImage: false,
      timeUnits: 1,
      tracks: [
        {
          '$GMSpriteFramesTrack': '',
          builtinName: 0,
          events: [],
          inheritsTrackColour: true,
          interpolation: 1,
          isCreationTrack: false,
          keyframes: {
            '$KeyframeStore<SpriteFrameKeyframe>': '',
            Keyframes: [
              {
                '$Keyframe<SpriteFrameKeyframe>': '',
                Channels: {
                  '0': {
                    '$SpriteFrameKeyframe': '',
                    Id: { name: frameUuid, path: spritePath },
                    resourceType: 'SpriteFrameKeyframe',
                    resourceVersion: '2.0',
                  },
                },
                Disabled: false,
                id: keyframeUuid,
                IsCreationKey: false,
                Key: 0.0,
                Length: 1.0,
                resourceType: 'Keyframe<SpriteFrameKeyframe>',
                resourceVersion: '2.0',
                Stretch: false,
              },
            ],
            resourceType: 'KeyframeStore<SpriteFrameKeyframe>',
            resourceVersion: '2.0',
          },
          modifiers: [],
          name: 'frames',
          resourceType: 'GMSpriteFramesTrack',
          resourceVersion: '2.0',
          spriteId: null,
          trackColour: 0,
          tracks: [],
          traits: 0,
        },
      ],
      visibleRange: null,
      volume: 1.0,
      xorigin: 0,
      yorigin: 0,
    },
    swatchColours: null,
    swfPrecision: 0.5,
    textureGroupId: { name: 'Default', path: 'texturegroups/Default' },
    type: 0,
    VTile: false,
    width: 1,
  };

  try {
    const png = makeTransparentPng1x1();
    fs.mkdirSync(spriteDir, { recursive: true });
    fs.mkdirSync(path.join(spriteDir, 'layers', frameUuid), { recursive: true });

    // composite frame PNG
    fs.writeFileSync(path.join(spriteDir, `${frameUuid}.png`), png);
    // layer PNG (находится в layers/{frameUUID}/, а не layers/{layerUUID}/)
    fs.writeFileSync(path.join(spriteDir, 'layers', frameUuid, `${layerUuid}.png`), png);

    writeGms2Json(yyPath, yyTemplate);

    await registerResource(yypPath, {
      name,
      relativePath: `sprites/${name}/${name}.yy`,
    });

    logger.info(CTX, 'Sprite created and registered', { name, frameUuid });
    return true;
  } catch (e) {
    logger.error(CTX, 'Failed to create sprite', { name, error: String(e) });
    try { fs.rmSync(spriteDir, { recursive: true, force: true }); } catch { /* ignore */ }
    return false;
  }
}
