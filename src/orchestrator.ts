import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ProjectModel, createEmptyModel, EVENT_TYPE_NAME } from './model/projectModel';
import { parseProject, parseEventFileName } from './parser/projectParser';
import { registerResource, unregisterResource } from './writer/yypUpdater';
import { removeObjectInstancesFromRoom, getRoomYyPath } from './writer/roomWriter';
import { createScript } from './writer/scriptCreator';
import { createRoom } from './writer/roomCreator';
import { createShader } from './writer/shaderCreator';
import { createTimeline } from './writer/timelineCreator';
import { createSprite } from './writer/spriteCreator';
import { createFont } from './writer/fontCreator';
import { createPath } from './writer/pathCreator';
import { createSequence } from './writer/sequenceCreator';
import { createNote } from './writer/noteCreator';
import { triggerRescan } from './trigger/rescanPing';
import { readGms2Json, writeGms2Json } from './utils/gms2Json';
import { validateResourceName, validateEventFile } from './validation/validate';
import { logger } from './utils/logger';

const CTX = 'Orchestrator';

// Типы ресурсов по префиксу пути
type ResourceType = 'objects' | 'scripts' | 'rooms' | 'sprites' | 'shaders' | 'timelines'
  | 'fonts' | 'paths' | 'sequences' | 'notes' | null;

function getResourceType(relPath: string): ResourceType {
  const normalized = relPath.replace(/\\/g, '/');
  if (normalized.startsWith('objects/'))   return 'objects';
  if (normalized.startsWith('scripts/'))   return 'scripts';
  if (normalized.startsWith('rooms/'))     return 'rooms';
  if (normalized.startsWith('sprites/'))   return 'sprites';
  if (normalized.startsWith('shaders/'))   return 'shaders';
  if (normalized.startsWith('timelines/')) return 'timelines';
  if (normalized.startsWith('fonts/'))     return 'fonts';
  if (normalized.startsWith('paths/'))     return 'paths';
  if (normalized.startsWith('sequences/')) return 'sequences';
  if (normalized.startsWith('notes/'))     return 'notes';
  return null;
}

// Последовательная очередь операций — исключает race condition
class OperationQueue {
  private readonly queue: Array<() => Promise<void>> = [];
  private running = false;

  enqueue(op: () => Promise<void>): void {
    this.queue.push(op);
    if (!this.running) void this.drain();
  }

  private async drain(): Promise<void> {
    this.running = true;
    while (this.queue.length > 0) {
      const op = this.queue.shift()!;
      try {
        await op();
      } catch (e) {
        logger.error(CTX, 'Operation failed in queue', { error: String(e) });
      }
    }
    this.running = false;
  }
}

export class GmsOrchestrator {
  private model: ProjectModel;
  private readonly watchers: vscode.FileSystemWatcher[] = [];
  private readonly queue = new OperationQueue();
  private readonly yypPath: string;
  private readonly projectRoot: string;

  // UI callbacks — устанавливаются из extension.ts до вызова initialize()
  private modelChangeListener?: (model: ProjectModel) => void;
  private statusListener?: (status: 'idle' | 'watching' | 'applying' | 'error', detail?: string) => void;

  // Startup grace period: блокируем touchYyp() и регистрацию новых ресурсов первые 2 секунды
  // после setupWatchers(). Предотвращает GMS2 full reload от buffered FS-событий при запуске.
  private _watcherStartTime = 0;
  // Debounce для touchYyp: множественные вызовы за 600ms → один реальный touch
  private _touchYypTimer: ReturnType<typeof setTimeout> | null = null;
  private get _isStartupGrace(): boolean {
    return this._watcherStartTime > 0 && (Date.now() - this._watcherStartTime) < 2000;
  }

  constructor(
    private readonly workspaceRoot: string,
    yypPath: string,
  ) {
    this.yypPath = yypPath;
    this.projectRoot = path.dirname(yypPath);
    this.model = createEmptyModel(this.projectRoot, yypPath);
  }

  /** Регистрирует callback — вызывается при каждом обновлении ProjectModel */
  onModelChange(listener: (model: ProjectModel) => void): void {
    this.modelChangeListener = listener;
  }

  /** Регистрирует callback — вызывается при изменении статуса extension */
  onStatusChange(listener: (status: 'idle' | 'watching' | 'applying' | 'error', detail?: string) => void): void {
    this.statusListener = listener;
  }

  async initialize(): Promise<void> {
    logger.info(CTX, 'Initializing', { yypPath: this.yypPath });
    this.model = await parseProject(this.yypPath);

    // Startup silent cleanup — только .yy файлов объектов/комнат (НЕ .yyp!).
    // cleanupStaleYypEntries() намеренно НЕ вызывается здесь: запись в .yyp → GMS2 full reload → все окна закрываются.
    // Для очистки stale .yyp записей — команда reloadProject (явно, по требованию).
    const staleRooms  = await this.cleanupStaleRoomInstances();
    const staleEvents = await this.cleanupStaleObjectEvents();
    // Startup sync: добавляем в eventList[] .gml файлы, созданные до запуска расширения.
    // НЕ вызываем touchYyp() — GMS2 сам обнаружит изменения .yy через свой watcher.
    const syncedGmls  = await this.syncOrphanGmlFiles();
    if (staleRooms + staleEvents + syncedGmls > 0) {
      this.model = await parseProject(this.yypPath);
    }

    this.setupWatchers();
    this._watcherStartTime = Date.now(); // grace period начинается здесь

    const yypName = path.basename(this.yypPath);
    logger.info(CTX, 'Ready', {
      objects: Object.keys(this.model.objects).length,
      scripts: Object.keys(this.model.scripts).length,
      rooms: Object.keys(this.model.rooms).length,
    });

    // Уведомляем UI — проект готов
    this.modelChangeListener?.(this.model);
    this.statusListener?.('watching', yypName);
  }

  // ─── Startup cleanup ──────────────────────────────────────────────────────

  /**
   * Проверяет ресурсы в .yyp — если .yy файл отсутствует на диске, снимает запись.
   * @returns количество удалённых записей
   */
  private async cleanupStaleYypEntries(): Promise<number> {
    const yyp = readGms2Json(this.yypPath) as Record<string, unknown>;
    const resources = (yyp['resources'] as Array<Record<string, unknown>>) ?? [];

    const staleNames: string[] = [];
    for (const res of resources) {
      const id = res['id'] as Record<string, unknown>;
      const resPath = id?.['path'] as string;
      const resName = id?.['name'] as string;
      if (!resPath || !resName) continue;
      const absPath = path.join(this.projectRoot, resPath);
      if (!fs.existsSync(absPath)) {
        staleNames.push(resName);
        logger.warn(CTX, 'Startup: stale .yyp entry (file missing)', { resName, resPath });
      }
    }

    for (const name of staleNames) {
      await unregisterResource(this.yypPath, name);
    }

    if (staleNames.length > 0) {
      logger.info(CTX, 'Startup .yyp cleanup done', { removed: staleNames.length });
    }
    return staleNames.length;
  }

  /**
   * Сканирует все комнаты проекта — удаляет инстансы объектов которых нет в модели.
   * @returns общее количество удалённых инстансов
   */
  private async cleanupStaleRoomInstances(): Promise<number> {
    let totalFixed = 0;

    for (const [roomName, roomMeta] of Object.entries(this.model.rooms)) {
      const roomYyPath = path.join(this.projectRoot, roomMeta.yyPath);
      if (!fs.existsSync(roomYyPath)) continue;

      try {
        const roomData = readGms2Json(roomYyPath) as Record<string, unknown>;
        const layers = (roomData['layers'] as Array<Record<string, unknown>>) ?? [];

        const staleObjects = new Set<string>();
        for (const layer of layers) {
          if (layer['resourceType'] !== 'GMRInstanceLayer') continue;
          const instances = (layer['instances'] as Array<Record<string, unknown>>) ?? [];
          for (const inst of instances) {
            const objId = inst['objectId'] as Record<string, unknown> | null;
            if (objId) {
              const objName = objId['name'] as string;
              if (!(objName in this.model.objects)) {
                staleObjects.add(objName);
              }
            }
          }
        }

        for (const staleObj of staleObjects) {
          const removed = removeObjectInstancesFromRoom(roomYyPath, staleObj);
          totalFixed += removed;
          logger.warn(CTX, 'Startup: removed stale instances', { roomName, staleObj, removed });
        }
      } catch (e) {
        logger.error(CTX, 'Startup room cleanup failed', { roomName, error: String(e) });
      }
    }

    if (totalFixed > 0) {
      logger.info(CTX, 'Startup room cleanup complete', { totalFixed });
    }
    return totalFixed;
  }

  /**
   * Сканирует все объекты — если eventList[] содержит событие без .gml на диске,
   * удаляет запись. Предотвращает GMS2 ошибки "event file not found" при открытии проекта.
   * @returns количество удалённых ghost-записей
   */
  private async cleanupStaleObjectEvents(): Promise<number> {
    let totalFixed = 0;

    for (const [objName, objMeta] of Object.entries(this.model.objects)) {
      const yyPath = path.join(this.projectRoot, objMeta.yyPath);
      if (!fs.existsSync(yyPath)) continue;

      let yyData: Record<string, unknown>;
      try {
        yyData = readGms2Json(yyPath) as Record<string, unknown>;
      } catch (e) {
        logger.error(CTX, 'Startup event cleanup: failed to read .yy', { objName, error: String(e) });
        continue;
      }

      const eventList = (yyData['eventList'] as Array<Record<string, unknown>>) ?? [];
      const objDir = path.dirname(yyPath);

      const validEvents = eventList.filter(e => {
        const eventType = (e['eventType'] as number) ?? -1;
        const eventNum  = (e['eventNum']  as number) ?? 0;
        const colId = e['collisionObjectId'] as Record<string, string> | null;

        let gmlFile: string;
        if (eventType === 4 && colId?.name) {
          gmlFile = `Collision_${colId.name}.gml`;
        } else {
          const typeName = EVENT_TYPE_NAME[eventType] ?? `Event${eventType}`;
          gmlFile = `${typeName}_${eventNum}.gml`;
        }
        return fs.existsSync(path.join(objDir, gmlFile));
      });

      if (validEvents.length !== eventList.length) {
        const removed = eventList.length - validEvents.length;
        yyData['eventList'] = validEvents;
        writeGms2Json(yyPath, yyData);
        totalFixed += removed;
        logger.warn(CTX, 'Startup: removed ghost events from .yy', { objName, removed });
      }
    }

    if (totalFixed > 0) {
      logger.info(CTX, 'Startup event cleanup complete', { totalFixed });
    }
    return totalFixed;
  }

  /**
   * Startup sync: сканирует .gml файлы существующих объектов — добавляет в eventList[] те,
   * что есть на диске, но отсутствуют в .yy. Исправляет ситуацию когда .gml создан до
   * запуска расширения (onFileCreated не сработал).
   * @returns количество добавленных событий
   */
  private async syncOrphanGmlFiles(): Promise<number> {
    let totalAdded = 0;

    for (const [objName, objMeta] of Object.entries(this.model.objects)) {
      const yyAbsPath = path.join(this.projectRoot, objMeta.yyPath);
      if (!fs.existsSync(yyAbsPath)) continue;

      const objDir = path.dirname(yyAbsPath);
      const diskGmls: string[] = fs.existsSync(objDir)
        ? fs.readdirSync(objDir).filter(f => f.endsWith('.gml'))
        : [];

      if (diskGmls.length === 0) continue;

      let yyData: Record<string, unknown>;
      try {
        yyData = readGms2Json(yyAbsPath) as Record<string, unknown>;
      } catch (e) {
        logger.error(CTX, 'Startup sync: failed to read .yy', { objName, error: String(e) });
        continue;
      }

      if (!Array.isArray(yyData['eventList'])) yyData['eventList'] = [];
      const eventList = yyData['eventList'] as Array<Record<string, unknown>>;

      let changed = false;
      for (const gmlFile of diskGmls) {
        const eventInfo = parseEventFileName(gmlFile);
        if (!eventInfo) continue; // не GMS2 событие (нераспознанное имя) — пропускаем

        const alreadyInList = eventList.some(
          e => (e['eventType'] as number) === eventInfo.eventType &&
               (e['eventNum'] as number) === eventInfo.eventNum,
        );
        if (alreadyInList) continue;

        const entry: Record<string, unknown> = {
          '$GMEvent': 'v1',
          '%Name': '',
          collisionObjectId: null,
          eventNum: eventInfo.eventNum,
          eventType: eventInfo.eventType,
          isDnD: false,
          name: '',
          resourceType: 'GMEvent',
          resourceVersion: '2.0',
        };
        if (eventInfo.eventType === 4 && eventInfo.collisionObjName) {
          entry['collisionObjectId'] = {
            name: eventInfo.collisionObjName,
            path: `objects/${eventInfo.collisionObjName}/${eventInfo.collisionObjName}.yy`,
          };
        }
        eventList.push(entry);
        changed = true;
        totalAdded++;
        logger.info(CTX, 'Startup sync: .gml added to eventList', { objName, gmlFile });
      }

      if (changed) {
        writeGms2Json(yyAbsPath, yyData);
      }
    }

    if (totalAdded > 0) {
      logger.info(CTX, 'Startup sync complete', { totalAdded });
    }
    return totalAdded;
  }

  // ─── FS Watcher (Phase 1.2) ───────────────────────────────────────────────

  private setupWatchers(): void {
    // Watcher 1: файлы .yy/.yyp/.gml
    const filePattern = new vscode.RelativePattern(this.workspaceRoot, '**/*.{yy,yyp,gml}');
    const fileWatcher = vscode.workspace.createFileSystemWatcher(filePattern);
    fileWatcher.onDidCreate(uri => this.onFileCreated(uri.fsPath));
    fileWatcher.onDidChange(uri => this.onFileModified(uri.fsPath));
    fileWatcher.onDidDelete(uri => this.onFileDeleted(uri.fsPath));
    this.watchers.push(fileWatcher);

    // Watcher 2: новые папки ресурсов — создаём .yy и регистрируем в .yyp
    const RESOURCE_DIRS = [
      'objects', 'scripts', 'rooms', 'sprites', 'shaders', 'timelines',
      'fonts', 'paths', 'sequences', 'notes',
    ];
    for (const dir of RESOURCE_DIRS) {
      const folderPattern = new vscode.RelativePattern(this.workspaceRoot, `${dir}/*`);
      const folderWatcher = vscode.workspace.createFileSystemWatcher(folderPattern);
      folderWatcher.onDidCreate(uri => this.onResourceFolderCreated(uri.fsPath, dir as ResourceType));
      // Папка ресурса удалена — снимаем с регистрации в .yyp
      folderWatcher.onDidDelete(uri => this.onResourceFolderDeleted(uri.fsPath));
      this.watchers.push(folderWatcher);
    }

    logger.info(CTX, 'FS watchers active', { file: '**/*.{yy,yyp,gml}', folders: 'objects|scripts|rooms|sprites/*' });
  }

  private shouldIgnore(fsPath: string): boolean {
    const rel = path.relative(this.projectRoot, fsPath);
    return (
      rel.includes('_rescan_ping') ||
      rel.includes('.tmp_') ||
      rel.includes('node_modules') ||
      rel.includes('.git') ||
      rel.includes('_DELETE') ||       // тестовые ресурсы из run_tests.js — не трогать реальный .yyp
      rel.includes('_test_runner')     // изолированный .yyp для тестов
    );
  }

  /** Папка ресурса удалена — снимаем с регистрации в .yyp + каскадное удаление инстансов */
  private onResourceFolderDeleted(fsPath: string): void {
    if (this.shouldIgnore(fsPath)) return;
    const resourceName = path.basename(fsPath);
    // isRegistered не покрывает shaders/timelines (их нет в модели).
    // Watcher 2 ограничен known resource dirs, поэтому сюда попадают только ресурс-папки.
    // unregisterResource идемпотентен — безопасно вызвать даже если ресурса нет в .yyp.
    logger.info(CTX, 'Resource folder deleted — unregistering', { resourceName });
    this.queue.enqueue(async () => {
      try {
        // Удаляем инстансы объекта из всех комнат до unregister
        if (resourceName in this.model.objects) {
          this.cascadeDeleteObjectInstances(resourceName);
        }
        await unregisterResource(this.yypPath, resourceName);
        logger.info(CTX, 'Resource unregistered after folder deletion', { resourceName });
      } catch (e) {
        logger.error(CTX, 'Failed to unregister deleted folder', { resourceName, error: String(e) });
      }
      // Перезагружаем модель и rescan ВСЕГДА — даже если unregister упал
      await this.reloadModel();
      triggerRescan(this.projectRoot);
    });
  }

  /**
   * Каскадное удаление: убирает все инстансы objectName из всех комнат проекта.
   * Вызывается при удалении папки объекта до unregisterResource().
   */
  private cascadeDeleteObjectInstances(objectName: string): void {
    let totalRemoved = 0;
    for (const [roomName, roomMeta] of Object.entries(this.model.rooms)) {
      const roomYyPath = getRoomYyPath(this.projectRoot, roomName);
      try {
        const removed = removeObjectInstancesFromRoom(roomYyPath, objectName);
        totalRemoved += removed;
      } catch (e) {
        logger.error(CTX, 'cascadeDelete: failed to clean room', { roomName, objectName, error: String(e) });
      }
    }
    if (totalRemoved > 0) {
      logger.info(CTX, 'Cascade delete complete', { objectName, totalRemoved });
    }
  }

  /** Новая папка в objects/*, scripts/*, rooms/*, sprites/* — создаём .yy и регистрируем */
  private onResourceFolderCreated(fsPath: string, resType: ResourceType): void {
    if (this.shouldIgnore(fsPath)) return;
    try {
      // Убеждаемся что это папка, а не файл без расширения
      if (!fs.statSync(fsPath).isDirectory()) return;
    } catch { return; }

    const resourceName = path.basename(fsPath);
    if (this.isRegistered(resourceName)) return;

    logger.info(CTX, 'Resource folder created — auto-registering', { resourceName, resType });
    this.queue.enqueue(() => this.handleNewResourceFolder(fsPath, resourceName, resType!));
  }

  private onFileCreated(fsPath: string): void {
    if (this.shouldIgnore(fsPath)) return;
    if (fsPath.endsWith('.gml')) {
      // Синхронная запись в .yy СРАЗУ — чтобы обогнать GMS2 native watcher (~10-50ms).
      // handleNewGmlImmediate возвращает false если объект не в модели → нужна async обработка.
      const handled = this.handleNewGmlImmediate(fsPath);
      if (!handled) {
        // Объект не найден в модели — авто-создание .yy + async логика
        this.queue.enqueue(() => this.handleNewGml(fsPath));
      }
      return;
    }
    this.queue.enqueue(() => this.handleFileCreated(fsPath));
  }

  private onFileModified(fsPath: string): void {
    if (this.shouldIgnore(fsPath)) return;
    if (fsPath.endsWith('.gml')) {
      // На Windows VS Code стреляет Change вместо Create для нового .gml файла.
      // Та же логика: синхронный immediate handler → fallback на async если объект не найден.
      const handled = this.handleNewGmlImmediate(fsPath);
      if (!handled) {
        this.queue.enqueue(() => this.handleNewGml(fsPath));
      }
      return;
    }
    if (fsPath.endsWith('.yy')) {
      // На Windows VS Code может стрелять Change вместо Create для нового файла.
      // handleNewYy внутри проверяет isRegistered() — если уже есть, просто reload.
      const resourceName = path.basename(fsPath, '.yy');
      if (!this.isRegistered(resourceName)) {
        if (this._isStartupGrace) {
          // Startup grace: не пытаемся регистрировать — это может быть buffered event.
          // registerResource() → запись в .yyp → GMS2 full reload → все табы закрываются.
          logger.warn(CTX, 'onFileModified: startup grace — .yy not registered, skip registerResource', { resourceName });
          this.queue.enqueue(() => this.reloadModel());
          return;
        }
        logger.debug(CTX, '.yy modified but not registered — treating as new resource', { resourceName });
        this.queue.enqueue(() => this.handleNewYy(fsPath));
        return;
      }
    }
    // .yy/.yyp изменились внешне (уже известный ресурс) — перегружаем модель
    this.queue.enqueue(() => this.reloadModel());
  }

  private onFileDeleted(fsPath: string): void {
    if (this.shouldIgnore(fsPath)) return;
    if (fsPath.endsWith('.yy')) {
      this.queue.enqueue(() => this.handleYyDeleted(fsPath));
    }
    if (fsPath.endsWith('.gml')) {
      // .gml удалён — два сценария:
      //   1. Пользователь удалил из VS Code Explorer → .yy всё ещё содержит запись → каскадное удаление из .yy
      //   2. GMS2 IDE удалил событие → сначала убрал из eventList[], потом .gml → .yy уже без записи → ничего
      // 300ms достаточно для GMS2 (C++) обновить .yy при намеренном удалении (~<50ms).
      setTimeout(() => this.handleGmlDeleted(fsPath), 300);
      this.queue.enqueue(() => this.reloadModel());
    }
  }

  /**
   * Обрабатывает удаление .gml файла события.
   * Два сценария:
   *   1. Пользователь удалил .gml из VS Code Explorer → .yy ещё содержит запись → каскадно чистим eventList[]
   *   2. GMS2 IDE удалил событие → сначала убрал из eventList[], потом удалил .gml → .yy без записи → ничего
   */
  private handleGmlDeleted(fsPath: string): void {
    if (fs.existsSync(fsPath)) return; // файл уже существует (пересоздан) — ничего делать

    const rel = path.relative(this.projectRoot, fsPath).replace(/\\/g, '/');
    const parts = rel.split('/');
    if (parts[0] !== 'objects' || parts.length < 3) return;

    const objName = parts[1];
    const gmlFile = parts[2];
    const eventInfo = parseEventFileName(gmlFile);
    if (!eventInfo) return;

    // Читаем .yy напрямую с диска (не из кэша модели)
    const yyAbsPath = path.join(this.projectRoot, 'objects', objName, `${objName}.yy`);
    if (!fs.existsSync(yyAbsPath)) return;

    try {
      const yyData = readGms2Json(yyAbsPath) as Record<string, unknown>;
      const eventList = (yyData['eventList'] as Array<Record<string, unknown>>) ?? [];
      const hasEntry = eventList.some(
        e => (e['eventType'] as number) === eventInfo.eventType &&
             (e['eventNum'] as number) === eventInfo.eventNum,
      );

      if (!hasEntry) {
        // GMS2 IDE удалил событие: убрал из eventList[] и удалил .gml — всё консистентно
        return;
      }

      // Пользователь удалил .gml из VS Code Explorer → каскадное удаление записи из eventList[]
      const filtered = eventList.filter(
        e => !((e['eventType'] as number) === eventInfo.eventType &&
               (e['eventNum'] as number) === eventInfo.eventNum),
      );
      yyData['eventList'] = filtered;
      writeGms2Json(yyAbsPath, yyData);
      logger.info(CTX, 'GML deleted: event cascade-removed from .yy', { objName, gmlFile });
      // .yyp touch → GMS2 полный reload → Object Editor скрывает удалённое событие
      setTimeout(() => this.touchYyp(), 300);
      triggerRescan(this.projectRoot);
      this.queue.enqueue(() => this.reloadModel());
    } catch (e) {
      logger.warn(CTX, 'handleGmlDeleted failed', { objName, gmlFile, error: String(e) });
    }
  }

  // ─── Обработчики событий (Phase 1.4) ─────────────────────────────────────

  /**
   * СИНХРОННАЯ немедленная запись в .yy — обходит очередь.
   * Вызывается прямо в watcher callback, до любого await.
   *
   * Проблема: GMS2 native C++ watcher срабатывает через ~10-50ms после создания файла.
   * Node.js watcher + очередь = ~100-200ms. GMS2 видит .gml без записи в .yy → удаляет как "осиротевший".
   * Решение: синхронная запись за ~1-5ms → мы обновляем .yy ДО того как GMS2 проверит.
   *
   * @returns true — событие обработано (модель обновлена через очередь)
   *          false — объект не найден в модели (caller должен enqueue handleNewGml)
   */
  private handleNewGmlImmediate(fsPath: string): boolean {
    const rel = path.relative(this.projectRoot, fsPath).replace(/\\/g, '/');

    // Диагностика: логируем watcher события в первые секунды после startup
    if (this._isStartupGrace) {
      logger.warn(CTX, 'handleNewGmlImmediate called during startup grace — possible buffered FS event', { rel });
    }

    const parts = rel.split('/');

    if (parts[0] !== 'objects' || parts.length < 3) return false;

    const objName = parts[1];
    const gmlFile = parts[2];

    if (!(objName in this.model.objects)) return false; // объект не в модели — нужен async fallback

    const eventInfo = parseEventFileName(gmlFile);
    if (!eventInfo) {
      // Имя файла не парсится как событие — просто обновляем UI
      this.queue.enqueue(() => this.reloadModel());
      return true;
    }

    const obj = this.model.objects[objName];
    const yyAbsPath = path.join(this.projectRoot, obj.yyPath);

    try {
      const yyData = readGms2Json(yyAbsPath) as Record<string, unknown>;
      if (!Array.isArray(yyData['eventList'])) yyData['eventList'] = [];
      const eventList = yyData['eventList'] as Array<Record<string, unknown>>;

      const alreadyExists = eventList.some(
        e => (e['eventType'] as number) === eventInfo.eventType &&
             (e['eventNum'] as number) === eventInfo.eventNum,
      );

      if (!alreadyExists) {
        const entry: Record<string, unknown> = {
          '$GMEvent': 'v1',
          '%Name': '',
          collisionObjectId: null,
          eventNum: eventInfo.eventNum,
          eventType: eventInfo.eventType,
          isDnD: false,
          name: '',
          resourceType: 'GMEvent',
          resourceVersion: '2.0',
        };
        if (eventInfo.eventType === 4 && eventInfo.collisionObjName) {
          entry['collisionObjectId'] = {
            name: eventInfo.collisionObjName,
            path: `objects/${eventInfo.collisionObjName}/${eventInfo.collisionObjName}.yy`,
          };
        }
        eventList.push(entry);
        writeGms2Json(yyAbsPath, yyData);
        // Atomic write использует rename → GMS2 получает RENAME-ивент вместо MODIFIED.
        // utimesSync генерирует FILE_NOTIFY_CHANGE_LAST_WRITE — GMS2 детектирует как изменение файла.
        try { fs.utimesSync(yyAbsPath, new Date(), new Date()); } catch { /* ignore */ }
        logger.info(CTX, 'Immediate .yy write: event added', { objName, gmlFile });
        // Обновляем VS Code File Explorer чтобы показать новые .gml файлы
        void vscode.commands.executeCommand('workbench.files.action.refreshFilesExplorer');
        // Первый rescan — немедленно (обновляет дерево ресурсов GMS2)
        triggerRescan(this.projectRoot);
        // .yyp touch через 300ms — GMS2 делает полный reload и показывает новый евент в Object Editor
        setTimeout(() => this.touchYyp(), 300);
        // Второй rescan через 1.5с — дополнительный пинг для надёжности
        setTimeout(() => triggerRescan(this.projectRoot), 1500);
      } else {
        logger.debug(CTX, 'Immediate: event already in .yy', { objName, gmlFile });
      }
    } catch (e) {
      logger.warn(CTX, 'Immediate .yy write failed', { objName, gmlFile, error: String(e) });
    }

    this.queue.enqueue(() => this.reloadModel());
    return true;
  }

  private async handleFileCreated(fsPath: string): Promise<void> {
    if (fsPath.endsWith('.yy')) {
      await this.handleNewYy(fsPath);
    } else if (fsPath.endsWith('.gml')) {
      await this.handleNewGml(fsPath);
    }
  }

  /**
   * Новая папка ресурса — создаём .yy (и .gml для скриптов) + регистрируем в .yyp.
   */
  private async handleNewResourceFolder(
    fsPath: string,
    resourceName: string,
    resType: ResourceType,
  ): Promise<void> {
    switch (resType) {
      case 'objects':
        await this.autoCreateObjectYy(resourceName);
        break;

      case 'scripts': {
        const ok = await createScript(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Script auto-created from folder', { resourceName });
        }
        break;
      }

      case 'rooms': {
        const ok = await createRoom(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Room auto-created from folder', { resourceName });
        }
        break;
      }

      case 'shaders': {
        const ok = await createShader(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Shader auto-created from folder', { resourceName });
        }
        break;
      }

      case 'timelines': {
        const ok = await createTimeline(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Timeline auto-created from folder', { resourceName });
        }
        break;
      }

      case 'sprites': {
        const ok = await createSprite(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Sprite auto-created from folder', { resourceName });
        }
        break;
      }

      case 'fonts': {
        const ok = await createFont(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Font auto-created from folder', { resourceName });
        }
        break;
      }

      case 'paths': {
        const ok = await createPath(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Path auto-created from folder', { resourceName });
        }
        break;
      }

      case 'sequences': {
        const ok = await createSequence(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Sequence auto-created from folder', { resourceName });
        }
        break;
      }

      case 'notes': {
        const ok = await createNote(this.projectRoot, this.yypPath, resourceName);
        if (ok) {
          await this.reloadModel();
          triggerRescan(this.projectRoot);
          logger.info(CTX, 'Note auto-created from folder', { resourceName });
        }
        break;
      }
    }
  }

  /** Новый .yy файл — регистрируем ресурс в .yyp */
  private async handleNewYy(fsPath: string): Promise<void> {
    const rel = path.relative(this.projectRoot, fsPath).replace(/\\/g, '/');
    const resType = getResourceType(rel);
    if (!resType) {
      logger.debug(CTX, 'New .yy outside known resource dirs, ignoring', { rel });
      return;
    }

    const resourceName = path.basename(fsPath, '.yy');

    if (this.isRegistered(resourceName)) {
      logger.debug(CTX, 'Resource already registered', { name: resourceName });
      return;
    }

    // Grace period: .yy для незарегистрированного ресурса пришёл сразу после startup.
    // Скорее всего это buffered FS-событие о файле который уже в .yyp (но модель ещё не полная).
    // Регистрация здесь вызовет registerResource() → запись в .yyp → GMS2 full reload.
    if (this._isStartupGrace) {
      logger.warn(CTX, 'handleNewYy: startup grace — skipping registerResource, reload model only', { resourceName });
      await this.reloadModel();
      return;
    }

    logger.info(CTX, 'New resource detected — registering', {
      name: resourceName,
      type: resType,
      path: rel,
    });

    try {
      await registerResource(this.yypPath, {
        name: resourceName,
        relativePath: rel,
        isRoom: resType === 'rooms',
      });

      await this.reloadModel();
      triggerRescan(this.projectRoot);

      logger.info(CTX, 'Resource registered + rescan triggered', { name: resourceName });
    } catch (e) {
      // Rollback: .yy файл уже создан пользователем, .yyp update упал
      // Логируем ошибку — пользователь может повторить (файл остаётся на диске)
      logger.error(CTX, 'Failed to register resource', {
        name: resourceName,
        error: String(e),
      });
    }
  }

  /**
   * Новый .gml в папке существующего объекта — обновляем eventList[] в .yy.
   * Критический факт №12: без этого GMS2 не увидит событие даже после rescan.
   */
  private async handleNewGml(fsPath: string): Promise<void> {
    const rel = path.relative(this.projectRoot, fsPath).replace(/\\/g, '/');
    const parts = rel.split('/');

    // Только объекты: objects/{objName}/{EventName_Num}.gml
    if (parts[0] !== 'objects' || parts.length < 3) return;

    const objName = parts[1];
    const gmlFile = parts[2];

    if (!(objName in this.model.objects)) {
      // Объект не в модели — возможно .yy ещё не создан.
      // Перечитываем модель (если .yy уже появился параллельно).
      logger.debug(CTX, 'New .gml: object not in model, reloading and retrying', { objName });
      await this.reloadModel();
      if (!(objName in this.model.objects)) {
        // .yy так и нет — создаём его автоматически из шаблона.
        logger.info(CTX, 'No .yy found — auto-creating object', { objName });
        await this.autoCreateObjectYy(objName);
        if (!(objName in this.model.objects)) {
          logger.error(CTX, 'Failed to auto-create object, skipping', { objName, gmlFile });
          return;
        }
      }
    }

    // Валидация события перед записью
    const evValidation = validateEventFile(gmlFile, objName, this.model);
    for (const w of evValidation.warnings) logger.warn(CTX, w, { objName, gmlFile });
    if (!evValidation.ok) {
      for (const e of evValidation.errors) logger.error(CTX, e, { objName, gmlFile });
      return;
    }

    const eventInfo = parseEventFileName(gmlFile);
    if (!eventInfo) {
      logger.warn(CTX, 'Cannot parse event from filename', { gmlFile });
      return;
    }

    const obj = this.model.objects[objName];

    // Читаем .yy с диска (не из кэша) — GMS2 мог записать событие в .yy раньше нас.
    // Без этого возникает race condition: in-memory модель устарела → дубликат в eventList[].
    const yyAbsPath = path.join(this.projectRoot, obj.yyPath);
    let alreadyExists = false;
    try {
      const yyData = readGms2Json(yyAbsPath) as Record<string, unknown>;
      const diskEventList = (yyData['eventList'] as Array<Record<string, unknown>>) ?? [];
      alreadyExists = diskEventList.some(
        e => (e['eventType'] as number) === eventInfo.eventType &&
             (e['eventNum'] as number) === eventInfo.eventNum,
      );
    } catch (e) {
      logger.warn(CTX, 'Could not read .yy for duplicate check', { objName, error: String(e) });
    }

    if (alreadyExists) {
      logger.debug(CTX, 'Event already in .yy on disk (GMS2 wrote it)', { objName, gmlFile });
      await this.reloadModel();
      return;
    }

    logger.info(CTX, 'New GML event — updating eventList', { objName, gmlFile, ...eventInfo });

    try {
      await this.addEventToYy(
        yyAbsPath,
        objName,
        eventInfo,
        gmlFile,
      );
      // Только rescanPing — window activate здесь опасен:
      // GMS2 может прочитать .yy ДО флаша записи и удалить .gml как "осиротевший".
      triggerRescan(this.projectRoot);
    } catch (e) {
      logger.error(CTX, 'Failed to update eventList', { objName, gmlFile, error: String(e) });
    }
  }

  /**
   * Публичный метод — создать объект по команде пользователя/AI.
   * Делегирует в autoCreateObjectYy + возвращает результат.
   */
  async createObject(name: string): Promise<boolean> {
    if (this.isRegistered(name)) {
      logger.warn(CTX, 'createObject: already exists', { name });
      return false;
    }
    await this.autoCreateObjectYy(name);
    return name in this.model.objects;
  }

  /**
   * Создаёт объектный .yy из шаблона и регистрирует его в .yyp.
   * Вызывается когда .gml появился в папке без .yy — полная автоматизация.
   */
  private async autoCreateObjectYy(objName: string): Promise<void> {
    // Валидация имени перед созданием
    const nameValidation = validateResourceName(objName, this.model);
    for (const w of nameValidation.warnings) logger.warn(CTX, w, { objName });
    if (!nameValidation.ok) {
      for (const e of nameValidation.errors) logger.error(CTX, e, { objName });
      return;
    }

    const yyPath = path.join(this.projectRoot, 'objects', objName, `${objName}.yy`);
    const projectName = path.basename(this.yypPath, '.yyp');

    const template: Record<string, unknown> = {
      '$GMObject': '',
      '%Name': objName,
      eventList: [],
      managed: true,
      name: objName,
      overriddenProperties: [],
      parent: { name: projectName, path: `${projectName}.yyp` },
      parentObjectId: null,
      persistent: false,
      physicsAngularDamping: 0.1,
      physicsDensity: 0.5,
      physicsFriction: 0.2,
      physicsGroup: 1,
      physicsKinematic: false,
      physicsLinearDamping: 0.1,
      physicsObject: false,
      physicsRestitution: 0.1,
      physicsSensor: false,
      physicsShape: 1,
      physicsShapePoints: [],
      physicsStartAwake: true,
      properties: [],
      resourceType: 'GMObject',
      resourceVersion: '2.0',
      solid: false,
      spriteId: null,
      spriteMaskId: null,
      visible: true,
    };

    writeGms2Json(yyPath, template);
    logger.info(CTX, 'Object .yy created from template', { objName, yyPath });

    // Чистим стale .yy файлы с чужим именем (появляются когда GMS2 переименовывает объект —
    // папка переименовывается, но старый .yy внутри остаётся)
    const objDir = path.join(this.projectRoot, 'objects', objName);
    try {
      for (const f of fs.readdirSync(objDir)) {
        if (f.endsWith('.yy') && f !== `${objName}.yy`) {
          fs.unlinkSync(path.join(objDir, f));
          logger.info(CTX, 'Removed stale .yy after GMS2 rename', { stale: f, objName });
        }
      }
    } catch { /* игнорируем если папка недоступна */ }

    const rel = `objects/${objName}/${objName}.yy`;
    await registerResource(this.yypPath, { name: objName, relativePath: rel });
    await this.reloadModel();
    triggerRescan(this.projectRoot);
  }

  /**
   * Добавляет запись в eventList[] объектного .yy файла.
   */
  private async addEventToYy(
    yyPath: string,
    objName: string,
    eventInfo: { eventType: number; eventNum: number; collisionObjName?: string },
    gmlFile: string,
  ): Promise<void> {
    const yyData = readGms2Json(yyPath) as Record<string, unknown>;

    if (!Array.isArray(yyData['eventList'])) {
      yyData['eventList'] = [];
    }

    // Структура записи события в GMS2 формате (name обязателен, иначе GMS2 schema error)
    const eventEntry: Record<string, unknown> = {
      '$GMEvent': 'v1',
      '%Name': '',
      collisionObjectId: null,
      eventNum: eventInfo.eventNum,
      eventType: eventInfo.eventType,
      isDnD: false,
      name: '',
      resourceType: 'GMEvent',
      resourceVersion: '2.0',
    };

    if (eventInfo.eventType === 4 && eventInfo.collisionObjName) {
      eventEntry['collisionObjectId'] = {
        name: eventInfo.collisionObjName,
        path: `objects/${eventInfo.collisionObjName}/${eventInfo.collisionObjName}.yy`,
      };
    }

    (yyData['eventList'] as unknown[]).push(eventEntry);
    writeGms2Json(yyPath, yyData);
    // .yyp touch → GMS2 полный reload → Object Editor показывает новый евент
    setTimeout(() => this.touchYyp(), 300);

    logger.info(CTX, 'eventList updated', { objName, gmlFile });
    await this.reloadModel();
  }

  /** Удалённый .yy — снимаем ресурс с регистрации в .yyp */
  private async handleYyDeleted(fsPath: string): Promise<void> {
    const resourceName = path.basename(fsPath, '.yy');
    if (!this.isRegistered(resourceName)) return;

    logger.info(CTX, 'Resource deleted — unregistering', { name: resourceName });

    try {
      await unregisterResource(this.yypPath, resourceName);
      logger.info(CTX, 'Resource unregistered after .yy deletion', { name: resourceName });
    } catch (e) {
      logger.error(CTX, 'Failed to unregister deleted resource', {
        name: resourceName,
        error: String(e),
      });
    }
    // Перезагружаем модель и rescan ВСЕГДА — даже если unregister упал
    await this.reloadModel();
    triggerRescan(this.projectRoot);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private isRegistered(name: string): boolean {
    return (
      name in this.model.objects   ||
      name in this.model.scripts   ||
      name in this.model.rooms     ||
      name in this.model.sprites   ||
      name in this.model.shaders   ||
      name in this.model.timelines ||
      name in this.model.fonts     ||
      name in this.model.paths     ||
      name in this.model.sequences ||
      name in this.model.notes
    );
  }

  private async reloadModel(): Promise<void> {
    try {
      this.model = await parseProject(this.yypPath);
      this.modelChangeListener?.(this.model);
    } catch (e) {
      logger.error(CTX, 'Failed to reload ProjectModel', { error: String(e) });
      this.statusListener?.('error', 'Failed to reload model');
    }
  }

  /**
   * Обновляет timestamp .yyp → GMS2 детектирует изменение и делает полный reload проекта.
   * Используется чтобы новые/удалённые события появились/исчезли в GMS2 Object Editor без ручных действий.
   */
  public touchYyp(): void {
    if (this._isStartupGrace) {
      // Блокируем touchYyp в startup grace period (первые 2с после setupWatchers).
      // Предотвращает GMS2 full reload от buffered watcher-событий при активации extension.
      const elapsed = Date.now() - this._watcherStartTime;
      logger.warn(CTX, `touchYyp blocked — startup grace (${elapsed}ms elapsed)`, {
        caller: new Error().stack?.split('\n')[2]?.trim() ?? 'unknown',
      });
      return;
    }
    // Debounce: множественные вызовы за 600ms (напр. при установке bridge с 5 GML файлами)
    // схлопываются в один реальный touch → GMS2 делает один reload вместо пяти.
    if (this._touchYypTimer) return;
    this._touchYypTimer = setTimeout(() => {
      this._touchYypTimer = null;
      try {
        fs.utimesSync(this.yypPath, new Date(), new Date());
        logger.debug(CTX, '.yyp touched — GMS2 full reload triggered');
      } catch (e) {
        logger.warn(CTX, 'touchYyp failed', { error: String(e) });
      }
    }, 600);
  }

  /**
   * Полный cleanup + reload (вызывается по команде reloadProject).
   * В отличие от initialize(), может писать в .yyp (очищает stale entries).
   * Пользователь вызывает явно — GMS2 reload ожидаем.
   */
  async fullCleanupAndReload(): Promise<void> {
    logger.info(CTX, 'Full cleanup + reload requested');
    this.model = await parseProject(this.yypPath);
    const staleYyp    = await this.cleanupStaleYypEntries();
    const staleRooms  = await this.cleanupStaleRoomInstances();
    const staleEvents = await this.cleanupStaleObjectEvents();
    const syncedGmls  = await this.syncOrphanGmlFiles();
    if (staleYyp + staleRooms + staleEvents + syncedGmls > 0) {
      this.model = await parseProject(this.yypPath);
      triggerRescan(this.projectRoot);
      if (syncedGmls > 0 || staleYyp > 0) {
        setTimeout(() => this.touchYyp(), 300);
      }
    }
    this.modelChangeListener?.(this.model);
    logger.info(CTX, 'Full cleanup done', { staleYyp, staleRooms, staleEvents, syncedGmls });
  }

  getModel(): ProjectModel {
    return this.model;
  }

  dispose(): void {
    for (const w of this.watchers) w.dispose();
    this.watchers.length = 0;
    logger.info(CTX, 'Disposed');
  }
}
