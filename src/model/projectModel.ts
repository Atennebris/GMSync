// Числа eventType из GMS2 (критический факт №11)
export const EVENT_TYPE = {
  Create: 0,
  Destroy: 1,
  Alarm: 2,
  Step: 3,
  Collision: 4,
  Keyboard: 5,
  Mouse: 6,
  Other: 7,
  Draw: 8,
  KeyPress: 9,
  KeyRelease: 10,
  CleanUp: 12,
} as const;

/** Запись события для пикера Command Palette */
export interface GmsEventEntry {
  label: string;
  eventType: number;
  eventNum: number;
  /** true — особый случай: нужно выбрать объект-цель столкновения */
  isCollision?: boolean;
}

/** Полный список GMS2 событий для Command Palette (без Keyboard/Mouse/Gesture — нужен keycode) */
export const GMS2_EVENT_LIST: GmsEventEntry[] = [
  // ── Основные ──────────────────────────────────────────────────────────────
  { label: 'Create',     eventType: 0,  eventNum: 0 },
  { label: 'Destroy',    eventType: 1,  eventNum: 0 },
  { label: 'Clean Up',   eventType: 12, eventNum: 0 },
  // ── Step ──────────────────────────────────────────────────────────────────
  { label: 'Step',       eventType: 3,  eventNum: 0 },
  { label: 'Begin Step', eventType: 3,  eventNum: 1 },
  { label: 'End Step',   eventType: 3,  eventNum: 2 },
  // ── Draw ──────────────────────────────────────────────────────────────────
  { label: 'Draw',           eventType: 8, eventNum: 0  },
  { label: 'Draw GUI',       eventType: 8, eventNum: 64 },
  { label: 'Draw Begin',     eventType: 8, eventNum: 72 },
  { label: 'Draw End',       eventType: 8, eventNum: 73 },
  { label: 'Draw GUI Begin', eventType: 8, eventNum: 74 },
  { label: 'Draw GUI End',   eventType: 8, eventNum: 75 },
  { label: 'Pre-Draw',       eventType: 8, eventNum: 76 },
  { label: 'Post-Draw',      eventType: 8, eventNum: 77 },
  // ── Alarm 0–11 ────────────────────────────────────────────────────────────
  ...Array.from({ length: 12 }, (_, i): GmsEventEntry => ({ label: `Alarm ${i}`, eventType: 2, eventNum: i })),
  // ── Other ─────────────────────────────────────────────────────────────────
  { label: 'Outside Room',       eventType: 7, eventNum: 0 },
  { label: 'Intersect Boundary', eventType: 7, eventNum: 1 },
  { label: 'Game Start',         eventType: 7, eventNum: 2 },
  { label: 'Game End',           eventType: 7, eventNum: 3 },
  { label: 'Room Start',         eventType: 7, eventNum: 4 },
  { label: 'Room End',           eventType: 7, eventNum: 5 },
  { label: 'Animation End',      eventType: 7, eventNum: 7 },
  { label: 'Animation Update',   eventType: 7, eventNum: 58 },
  { label: 'Animation Event',    eventType: 7, eventNum: 59 },
  // ── Async ─────────────────────────────────────────────────────────────────
  { label: 'Async: Image Loaded',  eventType: 7, eventNum: 60 },
  { label: 'Async: HTTP',          eventType: 7, eventNum: 62 },
  { label: 'Async: Dialog',        eventType: 7, eventNum: 63 },
  { label: 'Async: Audio Playback',eventType: 7, eventNum: 66 },
  { label: 'Async: Audio Recording',eventType: 7, eventNum: 67 },
  { label: 'Async: Steam',         eventType: 7, eventNum: 69 },
  { label: 'Async: Social',        eventType: 7, eventNum: 70 },
  { label: 'Async: In-App Purchase',eventType: 7, eventNum: 71 },
  { label: 'Async: Networking',    eventType: 7, eventNum: 68 },
  { label: 'Async: Save/Load',     eventType: 7, eventNum: 72 },
  { label: 'Async: System',        eventType: 7, eventNum: 75 },
  { label: 'Broadcast Message',    eventType: 7, eventNum: 76 },
  // ── User Events 0–15 ──────────────────────────────────────────────────────
  ...Array.from({ length: 16 }, (_, i): GmsEventEntry => ({ label: `User Event ${i}`, eventType: 7, eventNum: i + 10 })),
  // ── Collision (особый: нужен объект-цель) ─────────────────────────────────
  { label: 'Collision (выбрать объект)…', eventType: 4, eventNum: 0, isCollision: true },
];

export const EVENT_TYPE_NAME: Record<number, string> = {
  0: 'Create',
  1: 'Destroy',
  2: 'Alarm',
  3: 'Step',
  4: 'Collision',
  5: 'Keyboard',
  6: 'Mouse',
  7: 'Other',
  8: 'Draw',
  9: 'KeyPress',
  10: 'KeyRelease',
  12: 'CleanUp',
};

/**
 * Читаемые имена событий (источник: @bscotch/gml-parser objectEvents).
 * Охватывает все GMS2 события: Draw sub-types, Async, User Events и т.д.
 */
const EVENT_DISPLAY_NAMES_STATIC: Record<string, string> = {
  'Create_0':  'Create',
  'Destroy_0': 'Destroy',
  'CleanUp_0': 'Clean Up',
  'Step_0':    'Step',
  'Step_1':    'Begin Step',
  'Step_2':    'End Step',
  'Draw_0':    'Draw',
  'Draw_64':   'Draw GUI',
  'Draw_72':   'Draw Begin',
  'Draw_73':   'Draw End',
  'Draw_74':   'Draw GUI Begin',
  'Draw_75':   'Draw GUI End',
  'Draw_76':   'Pre-Draw',
  'Draw_77':   'Post-Draw',
  'Other_0':   'Outside Room',
  'Other_1':   'Intersect Boundary',
  'Other_2':   'Game Start',
  'Other_3':   'Game End',
  'Other_4':   'Room Start',
  'Other_5':   'Room End',
  'Other_7':   'Animation End',
  'Other_58':  'Animation Update',
  'Other_59':  'Animation Event',
  'Other_60':  'Async: Image Loaded',
  'Other_62':  'Async: HTTP',
  'Other_63':  'Async: Dialog',
  'Other_69':  'Async: Steam',
  'Other_70':  'Async: Social',
  'Other_72':  'Async: Save/Load',
  'Other_75':  'Async: System',
  'Other_76':  'Broadcast Message',
  'Mouse_56':  'Global Left Released',
  'Mouse_57':  'Global Right Released',
  'Mouse_58':  'Global Middle Released',
};

// User Event 0–15 → Other_10 – Other_25
for (let i = 0; i < 16; i++) {
  EVENT_DISPLAY_NAMES_STATIC[`Other_${i + 10}`] = `User Event ${i}`;
}
// Alarm 0–11
for (let i = 0; i <= 11; i++) {
  EVENT_DISPLAY_NAMES_STATIC[`Alarm_${i}`] = `Alarm ${i}`;
}

/**
 * Возвращает читаемое имя события по имени gml-файла.
 * "Create_0.gml" → "Create" | "Collision_obj_enemy.gml" → "Collision: obj_enemy"
 * Неизвестные события → возвращает base имя без .gml
 */
export function getEventDisplayName(gmlFile: string): string {
  const base = gmlFile.endsWith('.gml') ? gmlFile.slice(0, -4) : gmlFile;
  if (base in EVENT_DISPLAY_NAMES_STATIC) return EVENT_DISPLAY_NAMES_STATIC[base];
  const collMatch = base.match(/^Collision_(.+)$/);
  if (collMatch) return `Collision: ${collMatch[1]}`;
  return base;
}

export interface EventInfo {
  eventType: number;
  eventNum: number;
  /** Имя файла события, например "Create_0.gml" или "Collision_obj_enemy.gml" */
  gmlFile: string;
  /** Только для Collision событий — имя объекта столкновения */
  collisionObjectId?: string;
}

export interface ObjectMeta {
  name: string;
  /** Путь относительно projectRoot, например "objects/obj_player/obj_player.yy" */
  yyPath: string;
  /** Пути к .gml файлам событий, относительно projectRoot */
  gmlFiles: string[];
  events: EventInfo[];
  sprite?: string;
  parentObject?: string;
}

export interface ScriptMeta {
  name: string;
  yyPath: string;
  gmlPath: string;
}

export interface RoomMeta {
  name: string;
  yyPath: string;
}

/** Универсальный мета для ресурсов без специальной логики (sprites, shaders, sounds и т.д.) */
export interface GenericMeta {
  name: string;
  yyPath: string;
}

// Псевдоним для обратной совместимости
export type SpriteMeta = GenericMeta;

/** Все ключи ProjectModel, значение которых — Record<string, GenericMeta> */
export type GenericResourceKey =
  | 'sprites' | 'shaders' | 'timelines' | 'sounds'
  | 'fonts' | 'paths' | 'sequences' | 'tilesets'
  | 'animcurves' | 'extensions' | 'particles' | 'notes';

export interface ProjectModel {
  projectRoot: string;
  yypPath: string;
  // ── Ресурсы с полной логикой ──────────────────────────────────────────────
  objects:    Record<string, ObjectMeta>;
  scripts:    Record<string, ScriptMeta>;
  rooms:      Record<string, RoomMeta>;
  // ── Отображаемые ресурсы (read-only в Tree View, создаются через GMS2 IDE) ──
  sprites:    Record<string, GenericMeta>;
  shaders:    Record<string, GenericMeta>;
  timelines:  Record<string, GenericMeta>;
  sounds:     Record<string, GenericMeta>;
  fonts:      Record<string, GenericMeta>;
  paths:      Record<string, GenericMeta>;
  sequences:  Record<string, GenericMeta>;
  tilesets:   Record<string, GenericMeta>;
  animcurves: Record<string, GenericMeta>;
  extensions: Record<string, GenericMeta>;
  particles:  Record<string, GenericMeta>;
  notes:      Record<string, GenericMeta>;
}

export function createEmptyModel(projectRoot: string, yypPath: string): ProjectModel {
  return {
    projectRoot,
    yypPath,
    objects:    {},
    scripts:    {},
    rooms:      {},
    sprites:    {},
    shaders:    {},
    timelines:  {},
    sounds:     {},
    fonts:      {},
    paths:      {},
    sequences:  {},
    tilesets:   {},
    animcurves: {},
    extensions: {},
    particles:  {},
    notes:      {},
  };
}
