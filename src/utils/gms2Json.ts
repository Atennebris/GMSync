import * as fs from 'fs';
import { writeAtomicText } from '../writer/writeAtomic';

/**
 * Читает GMS2 JSON файл (.yyp / .yy).
 * GMS2 использует JSON с trailing commas — стандартный JSON.parse не справляется.
 */
export function readGms2Json(filePath: string): unknown {
  const raw = fs.readFileSync(filePath, 'utf8');
  // Удаляем trailing commas перед закрывающей скобкой/квадратной скобкой
  const clean = raw.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(clean);
}

/**
 * Записывает данные в GMS2 JSON формате (с trailing commas) через атомарный tmp→rename.
 * Гарантирует что GMS2 не прочитает полуготовый файл при crash.
 */
export function writeGms2Json(filePath: string, data: unknown): void {
  const json = toGms2Json(data);
  writeAtomicText(filePath, json);
}

/**
 * Сериализует объект в GMS2 JSON строку (с trailing commas в каждом элементе).
 */
export function toGms2Json(data: unknown): string {
  const standard = JSON.stringify(data, null, 2);
  // Добавляем trailing comma: после значения перед закрывающей скобкой/квадратной скобкой
  // Паттерн: не-запятая/не-пробел символ + перенос строки + отступ + } или ]
  return standard.replace(/([^,\s{\[])([ \t]*\n([ \t]*)[}\]])/g, '$1,$2');
}
