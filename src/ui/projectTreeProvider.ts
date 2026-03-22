import * as vscode from 'vscode';
import * as path from 'path';
import { ProjectModel, GenericResourceKey, getEventDisplayName } from '../model/projectModel';

export type ExtensionStatus = 'idle' | 'watching' | 'applying' | 'error';

// ─── Категории ресурсов ───────────────────────────────────────────────────────

type ResourceCategory = 'objects' | 'scripts' | 'rooms' | GenericResourceKey;

interface CategoryConfig {
  label: string;
  icon: string;
  color: string;
  /** Показывать категорию даже если она пустая */
  alwaysShow: boolean;
}

const CATEGORY_CONFIG: Record<ResourceCategory, CategoryConfig> = {
  objects:    { label: 'Objects',     icon: 'symbol-class',    color: 'charts.blue',    alwaysShow: true  },
  scripts:    { label: 'Scripts',     icon: 'symbol-function', color: 'charts.yellow',  alwaysShow: true  },
  rooms:      { label: 'Rooms',       icon: 'layout',          color: 'charts.green',   alwaysShow: true  },
  sprites:    { label: 'Sprites',     icon: 'file-media',      color: 'charts.purple',  alwaysShow: false },
  shaders:    { label: 'Shaders',     icon: 'symbol-color',    color: 'charts.orange',  alwaysShow: false },
  timelines:  { label: 'Timelines',   icon: 'watch',           color: 'charts.red',     alwaysShow: false },
  sounds:     { label: 'Sounds',      icon: 'unmute',          color: 'charts.blue',    alwaysShow: false },
  fonts:      { label: 'Fonts',       icon: 'text-size',       color: 'charts.yellow',  alwaysShow: false },
  paths:      { label: 'Paths',       icon: 'record',          color: 'charts.orange',  alwaysShow: false },
  sequences:  { label: 'Sequences',   icon: 'play-circle',     color: 'charts.green',   alwaysShow: false },
  tilesets:   { label: 'Tilesets',    icon: 'layers',          color: 'charts.purple',  alwaysShow: false },
  animcurves: { label: 'Anim Curves', icon: 'graph',           color: 'charts.blue',    alwaysShow: false },
  extensions: { label: 'Extensions',  icon: 'extensions',      color: 'charts.foreground', alwaysShow: false },
  particles:  { label: 'Particles',   icon: 'symbol-misc',     color: 'charts.orange',  alwaysShow: false },
  notes:      { label: 'Notes',       icon: 'note',            color: 'charts.yellow',  alwaysShow: false },
};

// Порядок отображения категорий в дереве
const CATEGORY_ORDER: ResourceCategory[] = [
  'objects', 'scripts', 'rooms',
  'sprites', 'sounds', 'fonts', 'tilesets',
  'shaders', 'timelines', 'sequences', 'paths',
  'animcurves', 'particles', 'extensions', 'notes',
];

// ─── Типы узлов дерева ────────────────────────────────────────────────────────

type NodeData =
  | { kind: 'status' }
  | { kind: 'category'; category: ResourceCategory }
  | { kind: 'object';   name: string }
  | { kind: 'script';   name: string }
  | { kind: 'resource'; category: ResourceCategory; name: string }
  | { kind: 'event';    objName: string; gmlFile: string };

// ─── Узел дерева ─────────────────────────────────────────────────────────────

export class GmsNode extends vscode.TreeItem {
  constructor(
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly data: NodeData,
    fsPath?: string,
  ) {
    super(label, collapsibleState);
    this.contextValue = data.kind === 'category'
      ? `category-${(data as { kind: 'category'; category: string }).category}`
      : data.kind;

    if (fsPath) {
      this.command = {
        command: 'vscode.open',
        title: 'Открыть файл',
        arguments: [vscode.Uri.file(fsPath)],
      };
    }
  }
}

// ─── Провайдер дерева ─────────────────────────────────────────────────────────

export class ProjectTreeProvider implements vscode.TreeDataProvider<GmsNode> {
  private readonly _onChange = new vscode.EventEmitter<GmsNode | undefined | null | void>();
  readonly onDidChangeTreeData = this._onChange.event;

  private model: ProjectModel | undefined;
  private currentStatus: ExtensionStatus = 'idle';
  private statusDetail: string | undefined;

  // ─── Публичные методы ─────────────────────────────────────────────────────

  refresh(model: ProjectModel): void {
    this.model = model;
    this._onChange.fire();
  }

  setStatus(status: ExtensionStatus, detail?: string): void {
    this.currentStatus = status;
    this.statusDetail = detail;
    this._onChange.fire();
  }

  clear(): void {
    this.model = undefined;
    this.currentStatus = 'idle';
    this.statusDetail = undefined;
    this._onChange.fire();
  }

  getTreeItem(element: GmsNode): vscode.TreeItem {
    return element;
  }

  getChildren(element?: GmsNode): GmsNode[] {
    if (!element) return this.buildRoot();
    const d = element.data;
    if (d.kind === 'category') return this.buildCategoryChildren(d.category);
    if (d.kind === 'object')   return this.buildObjectEvents(d.name);
    return [];
  }

  // ─── Root level ───────────────────────────────────────────────────────────

  private buildRoot(): GmsNode[] {
    const statusNode = this.buildStatusNode();
    if (!this.model) return [statusNode];
    return [statusNode, ...this.buildRootCategories()];
  }

  private buildStatusNode(): GmsNode {
    let label: string;
    let icon: vscode.ThemeIcon;
    let description: string | undefined;

    switch (this.currentStatus) {
      case 'idle':
        label = 'Нет проекта';
        icon = new vscode.ThemeIcon('circle-large-outline', new vscode.ThemeColor('charts.foreground'));
        description = 'Откройте папку с .yyp файлом';
        break;

      case 'watching': {
        label = this.statusDetail ?? 'Watching';
        icon = new vscode.ThemeIcon('eye', new vscode.ThemeColor('charts.green'));
        if (this.model) {
          const m = this.model;
          const obj   = Object.keys(m.objects).length;
          const scr   = Object.keys(m.scripts).length;
          const rom   = Object.keys(m.rooms).length;
          const spr   = Object.keys(m.sprites).length;
          const snd   = Object.keys(m.sounds).length;
          const total = obj + scr + rom + spr + snd
            + Object.keys(m.shaders).length
            + Object.keys(m.timelines).length
            + Object.keys(m.fonts).length
            + Object.keys(m.tilesets).length;
          description = `${obj} obj · ${scr} scr · ${rom} rooms · ${total} total`;
        } else {
          description = 'Watching...';
        }
        break;
      }

      case 'applying':
        label = 'Applying…';
        icon = new vscode.ThemeIcon('loading~spin', new vscode.ThemeColor('charts.blue'));
        description = this.statusDetail ?? 'Применяю изменения';
        break;

      case 'error':
        label = 'Error';
        icon = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
        description = this.statusDetail ?? 'Смотри логи (нажми сюда)';
        break;
    }

    const node = new GmsNode(label, vscode.TreeItemCollapsibleState.None, { kind: 'status' });
    node.iconPath = icon;
    node.description = description;
    if (this.currentStatus === 'error') {
      node.command = { command: 'gms2-live-edit.openLogs', title: 'Открыть логи', arguments: [] };
    }
    return node;
  }

  // ─── Root level — все категории ───────────────────────────────────────────

  private buildRootCategories(): GmsNode[] {
    const m = this.model!;
    const nodes: GmsNode[] = [];

    for (const cat of CATEGORY_ORDER) {
      const config = CATEGORY_CONFIG[cat];
      const count  = this.getCount(m, cat);

      if (config.alwaysShow || count > 0) {
        const node = this.makeCategoryNode(`${config.label}`, cat, config.icon, config.color, count);
        nodes.push(node);
      }
    }

    return nodes;
  }

  private makeCategoryNode(
    label: string,
    category: ResourceCategory,
    icon: string,
    color: string,
    count: number,
  ): GmsNode {
    const node = new GmsNode(
      label,
      count > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
      { kind: 'category', category },
    );
    node.iconPath  = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
    node.description = count > 0 ? `${count}` : undefined;
    return node;
  }

  // ─── Category level — список ресурсов ────────────────────────────────────

  private buildCategoryChildren(category: ResourceCategory): GmsNode[] {
    const m = this.model!;

    if (category === 'objects') {
      return Object.keys(m.objects).sort().map(name => {
        const obj     = m.objects[name];
        const evCount = obj.events.length;
        const node    = new GmsNode(
          name,
          evCount > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          { kind: 'object', name },
        );
        node.iconPath    = new vscode.ThemeIcon('symbol-class', new vscode.ThemeColor('charts.blue'));
        node.description = evCount > 0 ? `${evCount} event${evCount !== 1 ? 's' : ''}` : undefined;
        node.tooltip     = obj.sprite ? `Sprite: ${obj.sprite}` : undefined;
        return node;
      });
    }

    if (category === 'scripts') {
      return Object.keys(m.scripts).sort().map(name => {
        const meta    = m.scripts[name];
        const gmlPath = path.join(m.projectRoot, meta.gmlPath);
        const node    = new GmsNode(name, vscode.TreeItemCollapsibleState.None,
          { kind: 'script', name }, gmlPath);
        node.iconPath = new vscode.ThemeIcon('symbol-function', new vscode.ThemeColor('charts.yellow'));
        return node;
      });
    }

    // Все остальные категории — generic display
    const config     = CATEGORY_CONFIG[category];
    const collection = this.getCollection(m, category);

    return Object.keys(collection).sort().map(name => {
      const meta      = collection[name];
      const yyAbsPath = path.join(m.projectRoot, meta.yyPath);
      // Для комнат — не открываем .yy (большой JSON)
      const fsPath    = category === 'rooms' ? undefined : yyAbsPath;
      const node      = new GmsNode(name, vscode.TreeItemCollapsibleState.None,
        { kind: 'resource', category, name }, fsPath);
      node.iconPath = new vscode.ThemeIcon(config.icon, new vscode.ThemeColor(config.color));
      return node;
    });
  }

  // ─── Object level — список событий ──────────────────────────────────────

  private buildObjectEvents(objName: string): GmsNode[] {
    const m   = this.model!;
    const obj = m.objects[objName];
    if (!obj) return [];

    return obj.events.map(ev => {
      const gmlPath = path.join(m.projectRoot, 'objects', objName, ev.gmlFile);
      const label   = getEventDisplayName(ev.gmlFile);
      const node    = new GmsNode(
        label,
        vscode.TreeItemCollapsibleState.None,
        { kind: 'event', objName, gmlFile: ev.gmlFile },
        gmlPath,
      );
      node.iconPath = new vscode.ThemeIcon('symbol-event', new vscode.ThemeColor('charts.purple'));
      // description показывает сырое имя файла для отладки если label отличается
      if (label !== ev.gmlFile.slice(0, -4)) node.description = ev.gmlFile.slice(0, -4);
      return node;
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private getCount(m: ProjectModel, category: ResourceCategory): number {
    if (category === 'objects') return Object.keys(m.objects).length;
    if (category === 'scripts') return Object.keys(m.scripts).length;
    if (category === 'rooms')   return Object.keys(m.rooms).length;
    return Object.keys(m[category as GenericResourceKey]).length;
  }

  private getCollection(m: ProjectModel, category: ResourceCategory): Record<string, { name: string; yyPath: string }> {
    if (category === 'rooms') return m.rooms;
    return m[category as GenericResourceKey];
  }
}
