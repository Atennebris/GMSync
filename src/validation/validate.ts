import { ProjectModel } from '../model/projectModel';
import { parseEventFileName } from '../parser/projectParser';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

// Допустимые имена ресурсов GMS2: латиница/цифры/_, не начинается с цифры
const GMS2_NAME_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/**
 * Проверяет что имя нового ресурса валидно и уникально в ProjectModel.
 */
export function validateResourceName(name: string, model: ProjectModel): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!name || name.trim().length === 0) {
    errors.push('Resource name cannot be empty');
    return { ok: false, errors, warnings };
  }

  if (!GMS2_NAME_RE.test(name)) {
    errors.push(
      `Invalid GMS2 name "${name}": only letters, digits, underscore allowed; cannot start with digit`,
    );
  }

  if (name in model.objects) errors.push(`Object "${name}" already exists in project`);
  if (name in model.scripts) errors.push(`Script "${name}" already exists in project`);
  if (name in model.rooms) errors.push(`Room "${name}" already exists in project`);
  if (name in model.sprites) errors.push(`Sprite "${name}" already exists in project`);

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * Проверяет .gml файл события перед добавлением в eventList[].
 * - Имя файла должно парситься в корректный eventType/eventNum
 * - Для Collision событий — цель должна существовать в ProjectModel
 * - Дубликат события — предупреждение (не ошибка, GMS2 это не крашит)
 */
export function validateEventFile(
  gmlFile: string,
  objName: string,
  model: ProjectModel,
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const eventInfo = parseEventFileName(gmlFile);
  if (!eventInfo) {
    errors.push(
      `Cannot parse event type from "${gmlFile}". ` +
        'Expected: Create_0.gml, Step_0.gml, Alarm_3.gml, Collision_obj_enemy.gml, etc.',
    );
    return { ok: false, errors, warnings };
  }

  // Collision: цель должна существовать
  if (eventInfo.eventType === 4 && eventInfo.collisionObjName) {
    if (!(eventInfo.collisionObjName in model.objects)) {
      errors.push(
        `Collision target "${eventInfo.collisionObjName}" not found in project. ` +
          'Create that object first.',
      );
    }
  }

  // Дубликат события в eventList[]
  const obj = model.objects[objName];
  if (obj) {
    const duplicate = obj.events.some(
      e => e.eventType === eventInfo.eventType && e.eventNum === eventInfo.eventNum,
    );
    if (duplicate) {
      warnings.push(`Event "${gmlFile}" already exists in eventList for "${objName}"`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
