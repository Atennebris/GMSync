import * as vscode from 'vscode';
import { logger } from '../utils/logger';

const CTX = 'GmlThemes';

// ── Scope-группы из gml.tmLanguage.json ──────────────────────────────────────

const SCOPES = {
  keyword:   'keyword.control.gml',
  operators: ['keyword.operator.arithmetic.gml', 'keyword.operator.comparison.gml',
              'keyword.operator.logical.gml', 'keyword.operator.assignment.gml',
              'keyword.operator.bitwise.gml', 'keyword.operator.ternary.gml',
              'keyword.operator.new.gml'],
  storage:   ['storage.type.gml', 'storage.modifier.gml', 'storage.type.class'],
  funcKw:    'storage.type.function.gml',
  constant:  'constant.language.gml',
  number:    'constant.numeric',
  string:    'string.quoted.double.gml',
  comment:   ['comment.line.double-slash.gml', 'comment.line.triple-slash.gml', 'comment.block.gml'],
  funcDef:   'entity.name.function.gml',
  funcCall:  'support.function.gml',
  region:    ['keyword.region.begin.gml', 'keyword.region.end.gml'],
} as const;

// ── Типы ─────────────────────────────────────────────────────────────────────

export interface ThemePreviewColors {
  bg:       string;
  fg:       string;
  keyword:  string;
  storage:  string;
  constant: string;
  string:   string;
  comment:  string;
  number:   string;
  funcDef:  string;
  funcCall: string;
  operator: string;
}

export interface TextMateRule {
  scope: string | readonly string[];
  settings: { foreground?: string; fontStyle?: string };
}

export interface GmlTheme {
  id:          number;
  name:        string;
  emoji:       string;
  description: string;
  isHacker?:   boolean;
  preview:     ThemePreviewColors;
  rules:       TextMateRule[];
}

// ── 10 тем ───────────────────────────────────────────────────────────────────

export const GML_THEMES: GmlTheme[] = [

  // ── 0: Default ─────────────────────────────────────────────────────────────
  {
    id: 0, name: 'Default', emoji: 'O', description: 'Стандартная подсветка VS Code — без кастомизаций',
    preview: {
      bg: '#1e1e1e', fg: '#d4d4d4', keyword: '#569cd6', storage: '#569cd6',
      constant: '#4fc1ff', string: '#ce9178', comment: '#6a9955',
      number: '#b5cea8', funcDef: '#dcdcaa', funcCall: '#dcdcaa', operator: '#d4d4d4',
    },
    rules: [], // пустой = сброс
  },

  // ── 1: Classic ─────────────────────────────────────────────────────────────
  {
    id: 1, name: 'Classic', emoji: '#', description: 'Классическая синяя схема',
    preview: {
      bg: '#1a1a2e', fg: '#e0e0f0', keyword: '#5599ff', storage: '#66aaff',
      constant: '#ff9966', string: '#66cc77', comment: '#778877',
      number: '#ffcc66', funcDef: '#ffdd55', funcCall: '#aaddff', operator: '#cccccc',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#5599ff', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#66aaff' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#66aaff', fontStyle: 'bold' } },
      { scope: SCOPES.constant,            settings: { foreground: '#ff9966' } },
      { scope: SCOPES.string,              settings: { foreground: '#66cc77' } },
      { scope: SCOPES.comment,             settings: { foreground: '#778877', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#ffcc66' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#ffdd55', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#aaddff' } },
      { scope: SCOPES.operators,           settings: { foreground: '#cccccc' } },
    ],
  },

  // ── 2: Dark Pro ────────────────────────────────────────────────────────────
  {
    id: 2, name: 'Dark Pro', emoji: '@', description: 'Насыщенный тёмный GitHub стиль',
    preview: {
      bg: '#0d1117', fg: '#c9d1d9', keyword: '#ff7b72', storage: '#ffa657',
      constant: '#79c0ff', string: '#a5d6ff', comment: '#8b949e',
      number: '#79c0ff', funcDef: '#d2a8ff', funcCall: '#e3b341', operator: '#ff7b72',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#ff7b72', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#ffa657' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#ffa657', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#79c0ff' } },
      { scope: SCOPES.string,              settings: { foreground: '#a5d6ff' } },
      { scope: SCOPES.comment,             settings: { foreground: '#8b949e', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#79c0ff' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#d2a8ff', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#e3b341' } },
      { scope: SCOPES.operators,           settings: { foreground: '#ff7b72' } },
    ],
  },

  // ── 3: Monokai ─────────────────────────────────────────────────────────────
  {
    id: 3, name: 'Monokai', emoji: 'M', description: 'Яркий Monokai стиль',
    preview: {
      bg: '#272822', fg: '#f8f8f2', keyword: '#f92672', storage: '#66d9e8',
      constant: '#ae81ff', string: '#e6db74', comment: '#75715e',
      number: '#ae81ff', funcDef: '#a6e22e', funcCall: '#66d9e8', operator: '#f92672',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#f92672', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#66d9e8' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#66d9e8', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#ae81ff' } },
      { scope: SCOPES.string,              settings: { foreground: '#e6db74' } },
      { scope: SCOPES.comment,             settings: { foreground: '#75715e', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#ae81ff' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#a6e22e', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#66d9e8' } },
      { scope: SCOPES.operators,           settings: { foreground: '#f92672' } },
    ],
  },

  // ── 4: Solarized ───────────────────────────────────────────────────────────
  {
    id: 4, name: 'Solarized', emoji: '*', description: 'Solarized Dark — тёплый и глубокий',
    preview: {
      bg: '#002b36', fg: '#839496', keyword: '#859900', storage: '#2aa198',
      constant: '#b58900', string: '#2aa198', comment: '#586e75',
      number: '#d33682', funcDef: '#268bd2', funcCall: '#2aa198', operator: '#dc322f',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#859900', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#2aa198' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#2aa198', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#b58900' } },
      { scope: SCOPES.string,              settings: { foreground: '#2aa198' } },
      { scope: SCOPES.comment,             settings: { foreground: '#586e75', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#d33682' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#268bd2', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#2aa198' } },
      { scope: SCOPES.operators,           settings: { foreground: '#dc322f' } },
    ],
  },

  // ── 5: One Dark ────────────────────────────────────────────────────────────
  {
    id: 5, name: 'One Dark', emoji: '%', description: 'Atom One Dark',
    preview: {
      bg: '#282c34', fg: '#abb2bf', keyword: '#c678dd', storage: '#e06c75',
      constant: '#d19a66', string: '#98c379', comment: '#5c6370',
      number: '#d19a66', funcDef: '#61afef', funcCall: '#56b6c2', operator: '#c678dd',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#c678dd', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#e06c75' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#e06c75', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#d19a66' } },
      { scope: SCOPES.string,              settings: { foreground: '#98c379' } },
      { scope: SCOPES.comment,             settings: { foreground: '#5c6370', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#d19a66' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#61afef', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#56b6c2' } },
      { scope: SCOPES.operators,           settings: { foreground: '#c678dd' } },
    ],
  },

  // ── 6: Pastel ──────────────────────────────────────────────────────────────
  {
    id: 6, name: 'Pastel', emoji: '~', description: 'Нежные пастельные цвета',
    preview: {
      bg: '#1e1a2e', fg: '#e8d5c4', keyword: '#ffb3c6', storage: '#c8b6e2',
      constant: '#ffe0b5', string: '#b5ead7', comment: '#8899aa',
      number: '#ffdac1', funcDef: '#c7f2a4', funcCall: '#a2d2ff', operator: '#ffcfd2',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#ffb3c6', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#c8b6e2' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#c8b6e2', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#ffe0b5' } },
      { scope: SCOPES.string,              settings: { foreground: '#b5ead7' } },
      { scope: SCOPES.comment,             settings: { foreground: '#8899aa', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#ffdac1' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#c7f2a4', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#a2d2ff' } },
      { scope: SCOPES.operators,           settings: { foreground: '#ffcfd2' } },
    ],
  },

  // ── 7: HACKER ──────────────────────────────────────────────────────────────
  {
    id: 7, name: 'HACKER', emoji: '>', description: '>_ MATRIX MODE ACTIVATED',
    isHacker: true,
    preview: {
      bg: '#000000', fg: '#00ff41', keyword: '#00ff41', storage: '#39ff14',
      constant: '#7fff00', string: '#00aa22', comment: '#004400',
      number: '#33ff66', funcDef: '#00ff80', funcCall: '#00cc33', operator: '#66ff66',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#00ff41', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#39ff14', fontStyle: 'bold' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#39ff14', fontStyle: 'bold' } },
      { scope: SCOPES.constant,            settings: { foreground: '#7fff00' } },
      { scope: SCOPES.string,              settings: { foreground: '#00aa22' } },
      { scope: SCOPES.comment,             settings: { foreground: '#004d00', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#33ff66' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#00ff80', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#00cc33' } },
      { scope: SCOPES.operators,           settings: { foreground: '#66ff66' } },
      { scope: SCOPES.region,              settings: { foreground: '#00ff41', fontStyle: 'bold underline' } },
    ],
  },

  // ── 8: Retro ───────────────────────────────────────────────────────────────
  {
    id: 8, name: 'Retro', emoji: '$', description: 'CRT Amber — старый добрый терминал',
    preview: {
      bg: '#0d0700', fg: '#ffb000', keyword: '#ffd700', storage: '#ff8c00',
      constant: '#ffa500', string: '#cc8800', comment: '#664400',
      number: '#ffcc00', funcDef: '#ffee55', funcCall: '#ff9900', operator: '#ff6600',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#ffd700', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#ff8c00' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#ff8c00', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#ffa500' } },
      { scope: SCOPES.string,              settings: { foreground: '#cc8800' } },
      { scope: SCOPES.comment,             settings: { foreground: '#664400', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#ffcc00' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#ffee55', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#ff9900' } },
      { scope: SCOPES.operators,           settings: { foreground: '#ff6600' } },
    ],
  },

  // ── 9: Nord ────────────────────────────────────────────────────────────────
  {
    id: 9, name: 'Nord', emoji: '&', description: 'Холодный Nordic стиль',
    preview: {
      bg: '#2e3440', fg: '#d8dee9', keyword: '#81a1c1', storage: '#88c0d0',
      constant: '#b48ead', string: '#a3be8c', comment: '#4c566a',
      number: '#b48ead', funcDef: '#8fbcbb', funcCall: '#88c0d0', operator: '#81a1c1',
    },
    rules: [
      { scope: SCOPES.keyword,             settings: { foreground: '#81a1c1', fontStyle: 'bold' } },
      { scope: SCOPES.storage,             settings: { foreground: '#88c0d0' } },
      { scope: SCOPES.funcKw,              settings: { foreground: '#88c0d0', fontStyle: 'italic' } },
      { scope: SCOPES.constant,            settings: { foreground: '#b48ead' } },
      { scope: SCOPES.string,              settings: { foreground: '#a3be8c' } },
      { scope: SCOPES.comment,             settings: { foreground: '#4c566a', fontStyle: 'italic' } },
      { scope: SCOPES.number,              settings: { foreground: '#b48ead' } },
      { scope: SCOPES.funcDef,             settings: { foreground: '#8fbcbb', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,            settings: { foreground: '#88c0d0' } },
      { scope: SCOPES.operators,           settings: { foreground: '#81a1c1' } },
    ],
  },

  // ── 10: Aura ───────────────────────────────────────────────────────────────
  {
    id: 10, name: 'Aura', emoji: 'A', description: 'Тёмно-фиолетовая тема Aura',
    preview: { bg: '#15141b', fg: '#edecee', keyword: '#a277ff', storage: '#a277ff',
      constant: '#f694ff', string: '#61ffca', comment: '#6d6d6d',
      number: '#ffca85', funcDef: '#ffca85', funcCall: '#61ffca', operator: '#a277ff' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#a277ff', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#a277ff' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#a277ff', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f694ff' } },
      { scope: SCOPES.string,    settings: { foreground: '#61ffca' } },
      { scope: SCOPES.comment,   settings: { foreground: '#6d6d6d', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ffca85' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ffca85', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#61ffca' } },
      { scope: SCOPES.operators, settings: { foreground: '#a277ff' } },
    ],
  },

  // ── 11: Ayu ────────────────────────────────────────────────────────────────
  {
    id: 11, name: 'Ayu', emoji: 'Y', description: 'Ayu Dark — тёплый тёмный',
    preview: { bg: '#0d1017', fg: '#bfbdb6', keyword: '#ff8f40', storage: '#39bae6',
      constant: '#d2a6ff', string: '#aad94c', comment: '#acb6bf',
      number: '#d2a6ff', funcDef: '#ffb454', funcCall: '#ffb454', operator: '#f29668' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ff8f40', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#39bae6' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#39bae6', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#d2a6ff' } },
      { scope: SCOPES.string,    settings: { foreground: '#aad94c' } },
      { scope: SCOPES.comment,   settings: { foreground: '#acb6bf', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#d2a6ff' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ffb454', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#ffb454' } },
      { scope: SCOPES.operators, settings: { foreground: '#f29668' } },
    ],
  },

  // ── 12: Carbonfox ──────────────────────────────────────────────────────────
  {
    id: 12, name: 'Carbonfox', emoji: 'C', description: 'IBM Carbon Design тёмная',
    preview: { bg: '#161616', fg: '#f2f4f8', keyword: '#ee5396', storage: '#be95ff',
      constant: '#08bdba', string: '#42be65', comment: '#525252',
      number: '#08bdba', funcDef: '#78a9ff', funcCall: '#78a9ff', operator: '#ee5396' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ee5396', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#be95ff' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#be95ff', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#08bdba' } },
      { scope: SCOPES.string,    settings: { foreground: '#42be65' } },
      { scope: SCOPES.comment,   settings: { foreground: '#525252', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#08bdba' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#78a9ff', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#78a9ff' } },
      { scope: SCOPES.operators, settings: { foreground: '#ee5396' } },
    ],
  },

  // ── 13: Catppuccin (Mocha) ────────────────────────────────────────────────
  {
    id: 13, name: 'Catppuccin', emoji: 'K', description: 'Catppuccin Mocha — мягкий пастельный',
    preview: { bg: '#1e1e2e', fg: '#cdd6f4', keyword: '#cba6f7', storage: '#89dceb',
      constant: '#fab387', string: '#a6e3a1', comment: '#6c7086',
      number: '#fab387', funcDef: '#89b4fa', funcCall: '#89b4fa', operator: '#89dceb' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#cba6f7', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#89dceb' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#89dceb', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#fab387' } },
      { scope: SCOPES.string,    settings: { foreground: '#a6e3a1' } },
      { scope: SCOPES.comment,   settings: { foreground: '#6c7086', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#fab387' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#89b4fa', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#89b4fa' } },
      { scope: SCOPES.operators, settings: { foreground: '#89dceb' } },
    ],
  },

  // ── 14: Catppuccin Frappé ─────────────────────────────────────────────────
  {
    id: 14, name: 'Catppuccin Frappé', emoji: 'F', description: 'Catppuccin Frappé — средний контраст',
    preview: { bg: '#303446', fg: '#c6d0f5', keyword: '#ca9ee6', storage: '#85c1dc',
      constant: '#ef9f76', string: '#a6d189', comment: '#626880',
      number: '#ef9f76', funcDef: '#8caaee', funcCall: '#8caaee', operator: '#85c1dc' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ca9ee6', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#85c1dc' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#85c1dc', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ef9f76' } },
      { scope: SCOPES.string,    settings: { foreground: '#a6d189' } },
      { scope: SCOPES.comment,   settings: { foreground: '#626880', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ef9f76' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#8caaee', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#8caaee' } },
      { scope: SCOPES.operators, settings: { foreground: '#85c1dc' } },
    ],
  },

  // ── 15: Catppuccin Macchiato ──────────────────────────────────────────────
  {
    id: 15, name: 'Catppuccin Macchiato', emoji: 'T', description: 'Catppuccin Macchiato',
    preview: { bg: '#24273a', fg: '#cad3f5', keyword: '#c6a0f6', storage: '#7dc4e4',
      constant: '#f5a97f', string: '#a6da95', comment: '#5b6078',
      number: '#f5a97f', funcDef: '#8aadf4', funcCall: '#8aadf4', operator: '#7dc4e4' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#c6a0f6', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#7dc4e4' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#7dc4e4', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f5a97f' } },
      { scope: SCOPES.string,    settings: { foreground: '#a6da95' } },
      { scope: SCOPES.comment,   settings: { foreground: '#5b6078', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f5a97f' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#8aadf4', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#8aadf4' } },
      { scope: SCOPES.operators, settings: { foreground: '#7dc4e4' } },
    ],
  },

  // ── 16: Cobalt2 ────────────────────────────────────────────────────────────
  {
    id: 16, name: 'Cobalt2', emoji: '2', description: 'Cobalt2 — насыщенный синий',
    preview: { bg: '#193549', fg: '#ffffff', keyword: '#ff9d00', storage: '#80ffbb',
      constant: '#ff628c', string: '#3ad900', comment: '#0088ff',
      number: '#ff628c', funcDef: '#ffc600', funcCall: '#ffc600', operator: '#ff9d00' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ff9d00', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#80ffbb' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#80ffbb', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ff628c' } },
      { scope: SCOPES.string,    settings: { foreground: '#3ad900' } },
      { scope: SCOPES.comment,   settings: { foreground: '#0088ff', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ff628c' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ffc600', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#ffc600' } },
      { scope: SCOPES.operators, settings: { foreground: '#ff9d00' } },
    ],
  },

  // ── 17: Cursor ─────────────────────────────────────────────────────────────
  {
    id: 17, name: 'Cursor', emoji: '_', description: 'Cursor IDE тёмная тема',
    preview: { bg: '#141414', fg: '#d4d4d4', keyword: '#c586c0', storage: '#4ec9b0',
      constant: '#4fc1ff', string: '#ce9178', comment: '#6a9955',
      number: '#b5cea8', funcDef: '#dcdcaa', funcCall: '#dcdcaa', operator: '#d4d4d4' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#c586c0', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#4ec9b0' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#4ec9b0', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#4fc1ff' } },
      { scope: SCOPES.string,    settings: { foreground: '#ce9178' } },
      { scope: SCOPES.comment,   settings: { foreground: '#6a9955', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#b5cea8' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#dcdcaa', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#dcdcaa' } },
      { scope: SCOPES.operators, settings: { foreground: '#d4d4d4' } },
    ],
  },

  // ── 18: Dracula ────────────────────────────────────────────────────────────
  {
    id: 18, name: 'Dracula', emoji: 'D', description: 'Dracula — классический тёмный',
    preview: { bg: '#282a36', fg: '#f8f8f2', keyword: '#ff79c6', storage: '#8be9fd',
      constant: '#bd93f9', string: '#f1fa8c', comment: '#6272a4',
      number: '#bd93f9', funcDef: '#50fa7b', funcCall: '#50fa7b', operator: '#ff79c6' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ff79c6', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#8be9fd' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#8be9fd', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#bd93f9' } },
      { scope: SCOPES.string,    settings: { foreground: '#f1fa8c' } },
      { scope: SCOPES.comment,   settings: { foreground: '#6272a4', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#bd93f9' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#50fa7b', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#50fa7b' } },
      { scope: SCOPES.operators, settings: { foreground: '#ff79c6' } },
    ],
  },

  // ── 19: Everforest ─────────────────────────────────────────────────────────
  {
    id: 19, name: 'Everforest', emoji: 'E', description: 'Everforest — тёплый лесной',
    preview: { bg: '#2d353b', fg: '#d3c6aa', keyword: '#e67e80', storage: '#83c092',
      constant: '#d699b6', string: '#a7c080', comment: '#859289',
      number: '#d699b6', funcDef: '#7fbbb3', funcCall: '#7fbbb3', operator: '#e67e80' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#e67e80', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#83c092' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#83c092', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#d699b6' } },
      { scope: SCOPES.string,    settings: { foreground: '#a7c080' } },
      { scope: SCOPES.comment,   settings: { foreground: '#859289', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#d699b6' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#7fbbb3', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#7fbbb3' } },
      { scope: SCOPES.operators, settings: { foreground: '#e67e80' } },
    ],
  },

  // ── 20: Flexoki ────────────────────────────────────────────────────────────
  {
    id: 20, name: 'Flexoki', emoji: 'X', description: 'Flexoki Dark — чернильный тёплый',
    preview: { bg: '#100f0f', fg: '#cecdc3', keyword: '#d14d41', storage: '#3aa99f',
      constant: '#8b7ec8', string: '#879a39', comment: '#575653',
      number: '#8b7ec8', funcDef: '#d0a215', funcCall: '#d0a215', operator: '#d14d41' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#d14d41', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#3aa99f' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#3aa99f', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#8b7ec8' } },
      { scope: SCOPES.string,    settings: { foreground: '#879a39' } },
      { scope: SCOPES.comment,   settings: { foreground: '#575653', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#8b7ec8' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#d0a215', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#d0a215' } },
      { scope: SCOPES.operators, settings: { foreground: '#d14d41' } },
    ],
  },

  // ── 21: GitHub ─────────────────────────────────────────────────────────────
  {
    id: 21, name: 'GitHub', emoji: 'G', description: 'GitHub Dark Dimmed',
    preview: { bg: '#22272e', fg: '#adbac7', keyword: '#f47067', storage: '#f69d50',
      constant: '#6cb6ff', string: '#96d0ff', comment: '#768390',
      number: '#6cb6ff', funcDef: '#dcbdfb', funcCall: '#6cb6ff', operator: '#f47067' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#f47067', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#f69d50' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#f69d50', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#6cb6ff' } },
      { scope: SCOPES.string,    settings: { foreground: '#96d0ff' } },
      { scope: SCOPES.comment,   settings: { foreground: '#768390', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#6cb6ff' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#dcbdfb', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#6cb6ff' } },
      { scope: SCOPES.operators, settings: { foreground: '#f47067' } },
    ],
  },

  // ── 22: Gruvbox ────────────────────────────────────────────────────────────
  {
    id: 22, name: 'Gruvbox', emoji: 'V', description: 'Gruvbox Dark — тёплый ретро',
    preview: { bg: '#282828', fg: '#ebdbb2', keyword: '#fb4934', storage: '#83a598',
      constant: '#d3869b', string: '#b8bb26', comment: '#928374',
      number: '#d3869b', funcDef: '#fabd2f', funcCall: '#8ec07c', operator: '#fe8019' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#fb4934', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#83a598' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#83a598', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#d3869b' } },
      { scope: SCOPES.string,    settings: { foreground: '#b8bb26' } },
      { scope: SCOPES.comment,   settings: { foreground: '#928374', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#d3869b' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#fabd2f', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#8ec07c' } },
      { scope: SCOPES.operators, settings: { foreground: '#fe8019' } },
    ],
  },

  // ── 23: Kanagawa ───────────────────────────────────────────────────────────
  {
    id: 23, name: 'Kanagawa', emoji: 'W', description: 'Kanagawa — японский пейзаж',
    preview: { bg: '#1f1f28', fg: '#dcd7ba', keyword: '#957fb8', storage: '#7fb4ca',
      constant: '#ff5d62', string: '#98bb6c', comment: '#727169',
      number: '#d27e99', funcDef: '#7e9cd8', funcCall: '#7aa89f', operator: '#957fb8' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#957fb8', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#7fb4ca' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#7fb4ca', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ff5d62' } },
      { scope: SCOPES.string,    settings: { foreground: '#98bb6c' } },
      { scope: SCOPES.comment,   settings: { foreground: '#727169', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#d27e99' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#7e9cd8', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#7aa89f' } },
      { scope: SCOPES.operators, settings: { foreground: '#957fb8' } },
    ],
  },

  // ── 24: Lucent-Orng ────────────────────────────────────────────────────────
  {
    id: 24, name: 'Lucent-Orng', emoji: 'L', description: 'Lucent Orange — тёплый оранжевый',
    preview: { bg: '#1a1308', fg: '#e0d0b0', keyword: '#ff9248', storage: '#7ec8e3',
      constant: '#d4a0ff', string: '#b3d17a', comment: '#664422',
      number: '#d4a0ff', funcDef: '#ffb86c', funcCall: '#ffb86c', operator: '#ff9248' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ff9248', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#7ec8e3' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#7ec8e3', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#d4a0ff' } },
      { scope: SCOPES.string,    settings: { foreground: '#b3d17a' } },
      { scope: SCOPES.comment,   settings: { foreground: '#664422', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#d4a0ff' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ffb86c', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#ffb86c' } },
      { scope: SCOPES.operators, settings: { foreground: '#ff9248' } },
    ],
  },

  // ── 25: Material ───────────────────────────────────────────────────────────
  {
    id: 25, name: 'Material', emoji: 'I', description: 'Material Theme Oceanic',
    preview: { bg: '#212121', fg: '#eeffff', keyword: '#c792ea', storage: '#89ddff',
      constant: '#f78c6c', string: '#c3e88d', comment: '#546e7a',
      number: '#f78c6c', funcDef: '#82aaff', funcCall: '#82aaff', operator: '#89ddff' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#c792ea', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#89ddff' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#89ddff', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f78c6c' } },
      { scope: SCOPES.string,    settings: { foreground: '#c3e88d' } },
      { scope: SCOPES.comment,   settings: { foreground: '#546e7a', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f78c6c' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#82aaff', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#82aaff' } },
      { scope: SCOPES.operators, settings: { foreground: '#89ddff' } },
    ],
  },

  // ── 26: Matrix ─────────────────────────────────────────────────────────────
  {
    id: 26, name: 'Matrix', emoji: 'Z', description: 'Matrix — зелёный монохром (мягкий)',
    preview: { bg: '#0c140c', fg: '#b3ffb3', keyword: '#80ff80', storage: '#40ff40',
      constant: '#a0ffa0', string: '#009900', comment: '#2d5a2d',
      number: '#60ff60', funcDef: '#00ff00', funcCall: '#55cc55', operator: '#80ff80' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#80ff80', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#40ff40' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#40ff40', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#a0ffa0' } },
      { scope: SCOPES.string,    settings: { foreground: '#009900' } },
      { scope: SCOPES.comment,   settings: { foreground: '#2d5a2d', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#60ff60' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#00ff00', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#55cc55' } },
      { scope: SCOPES.operators, settings: { foreground: '#80ff80' } },
    ],
  },

  // ── 27: Mercury ────────────────────────────────────────────────────────────
  {
    id: 27, name: 'Mercury', emoji: 'Q', description: 'Mercury — минималистичный серый',
    preview: { bg: '#1c1c1c', fg: '#d4d4d4', keyword: '#ffffff', storage: '#b0b0b0',
      constant: '#cccccc', string: '#909090', comment: '#555555',
      number: '#c0c0c0', funcDef: '#e8e8e8', funcCall: '#bbbbbb', operator: '#aaaaaa' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ffffff', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#b0b0b0' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#b0b0b0', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#cccccc' } },
      { scope: SCOPES.string,    settings: { foreground: '#909090' } },
      { scope: SCOPES.comment,   settings: { foreground: '#555555', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#c0c0c0' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#e8e8e8', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#bbbbbb' } },
      { scope: SCOPES.operators, settings: { foreground: '#aaaaaa' } },
    ],
  },

  // ── 28: Night Owl ──────────────────────────────────────────────────────────
  {
    id: 28, name: 'Night Owl', emoji: 'N', description: 'Night Owl — ночная сова',
    preview: { bg: '#011627', fg: '#d6deeb', keyword: '#c792ea', storage: '#addb67',
      constant: '#ff5874', string: '#ecc48d', comment: '#637777',
      number: '#f78c6c', funcDef: '#82aaff', funcCall: '#82aaff', operator: '#c792ea' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#c792ea', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#addb67' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#addb67', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ff5874' } },
      { scope: SCOPES.string,    settings: { foreground: '#ecc48d' } },
      { scope: SCOPES.comment,   settings: { foreground: '#637777', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f78c6c' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#82aaff', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#82aaff' } },
      { scope: SCOPES.operators, settings: { foreground: '#c792ea' } },
    ],
  },

  // ── 29: OpenCode ───────────────────────────────────────────────────────────
  {
    id: 29, name: 'OpenCode', emoji: 'P', description: 'OpenCode — синий чистый',
    preview: { bg: '#0a0e1a', fg: '#c8d3f5', keyword: '#89b4fa', storage: '#94e2d5',
      constant: '#f38ba8', string: '#a6e3a1', comment: '#6272a4',
      number: '#f38ba8', funcDef: '#cba6f7', funcCall: '#89b4fa', operator: '#89b4fa' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#89b4fa', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#94e2d5' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#94e2d5', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f38ba8' } },
      { scope: SCOPES.string,    settings: { foreground: '#a6e3a1' } },
      { scope: SCOPES.comment,   settings: { foreground: '#6272a4', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f38ba8' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#cba6f7', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#89b4fa' } },
      { scope: SCOPES.operators, settings: { foreground: '#89b4fa' } },
    ],
  },

  // ── 30: Orng ───────────────────────────────────────────────────────────────
  {
    id: 30, name: 'Orng', emoji: 'U', description: 'Orng — чистый оранжевый акцент',
    preview: { bg: '#1a1008', fg: '#e8d5b0', keyword: '#ff8c00', storage: '#ff7700',
      constant: '#ffc567', string: '#d4b896', comment: '#664400',
      number: '#ffc567', funcDef: '#ffa040', funcCall: '#ff9020', operator: '#ff6600' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ff8c00', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#ff7700' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#ff7700', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ffc567' } },
      { scope: SCOPES.string,    settings: { foreground: '#d4b896' } },
      { scope: SCOPES.comment,   settings: { foreground: '#664400', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ffc567' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ffa040', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#ff9020' } },
      { scope: SCOPES.operators, settings: { foreground: '#ff6600' } },
    ],
  },

  // ── 31: Osaka-Jade ─────────────────────────────────────────────────────────
  {
    id: 31, name: 'Osaka-Jade', emoji: 'J', description: 'Osaka Jade — нефритовый японский',
    preview: { bg: '#1a2420', fg: '#d4e8e0', keyword: '#4fd6be', storage: '#2ac3de',
      constant: '#ff9e64', string: '#9ece6a', comment: '#565f89',
      number: '#ff9e64', funcDef: '#73daca', funcCall: '#7dcfff', operator: '#4fd6be' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#4fd6be', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#2ac3de' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#2ac3de', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ff9e64' } },
      { scope: SCOPES.string,    settings: { foreground: '#9ece6a' } },
      { scope: SCOPES.comment,   settings: { foreground: '#565f89', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ff9e64' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#73daca', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#7dcfff' } },
      { scope: SCOPES.operators, settings: { foreground: '#4fd6be' } },
    ],
  },

  // ── 32: Palenight ──────────────────────────────────────────────────────────
  {
    id: 32, name: 'Palenight', emoji: 'H', description: 'Material Palenight — ночной синий',
    preview: { bg: '#292d3e', fg: '#a6accd', keyword: '#c792ea', storage: '#89ddff',
      constant: '#f78c6c', string: '#c3e88d', comment: '#676e95',
      number: '#f78c6c', funcDef: '#82aaff', funcCall: '#82aaff', operator: '#89ddff' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#c792ea', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#89ddff' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#89ddff', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f78c6c' } },
      { scope: SCOPES.string,    settings: { foreground: '#c3e88d' } },
      { scope: SCOPES.comment,   settings: { foreground: '#676e95', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f78c6c' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#82aaff', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#82aaff' } },
      { scope: SCOPES.operators, settings: { foreground: '#89ddff' } },
    ],
  },

  // ── 33: Rosé Pine ──────────────────────────────────────────────────────────
  {
    id: 33, name: 'Rosé Pine', emoji: 'R', description: 'Rosé Pine — розовый сосновый лес',
    preview: { bg: '#191724', fg: '#e0def4', keyword: '#c4a7e7', storage: '#31748f',
      constant: '#eb6f92', string: '#9ccfd8', comment: '#6e6a86',
      number: '#eb6f92', funcDef: '#ebbcba', funcCall: '#f6c177', operator: '#c4a7e7' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#c4a7e7', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#31748f' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#31748f', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#eb6f92' } },
      { scope: SCOPES.string,    settings: { foreground: '#9ccfd8' } },
      { scope: SCOPES.comment,   settings: { foreground: '#6e6a86', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#eb6f92' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ebbcba', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#f6c177' } },
      { scope: SCOPES.operators, settings: { foreground: '#c4a7e7' } },
    ],
  },

  // ── 34: Synthwave 84 ───────────────────────────────────────────────────────
  {
    id: 34, name: 'Synthwave84', emoji: 'S', description: 'Synthwave 84 — неоновый ретро-фьючер',
    preview: { bg: '#262335', fg: '#ffffff', keyword: '#ff7edb', storage: '#fede5d',
      constant: '#f97e72', string: '#ff8b39', comment: '#848bbd',
      number: '#f97e72', funcDef: '#36f9f6', funcCall: '#36f9f6', operator: '#ff7edb' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ff7edb', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#fede5d' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#fede5d', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f97e72' } },
      { scope: SCOPES.string,    settings: { foreground: '#ff8b39' } },
      { scope: SCOPES.comment,   settings: { foreground: '#848bbd', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f97e72' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#36f9f6', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#36f9f6' } },
      { scope: SCOPES.operators, settings: { foreground: '#ff7edb' } },
    ],
  },

  // ── 35: Tokyo Night ────────────────────────────────────────────────────────
  {
    id: 35, name: 'Tokyo Night', emoji: 'O', description: 'Tokyo Night — ночные неоны Токио',
    preview: { bg: '#1a1b26', fg: '#a9b1d6', keyword: '#bb9af7', storage: '#2ac3de',
      constant: '#ff9e64', string: '#9ece6a', comment: '#565f89',
      number: '#ff9e64', funcDef: '#7aa2f7', funcCall: '#7dcfff', operator: '#89ddff' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#bb9af7', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#2ac3de' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#2ac3de', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#ff9e64' } },
      { scope: SCOPES.string,    settings: { foreground: '#9ece6a' } },
      { scope: SCOPES.comment,   settings: { foreground: '#565f89', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ff9e64' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#7aa2f7', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#7dcfff' } },
      { scope: SCOPES.operators, settings: { foreground: '#89ddff' } },
    ],
  },

  // ── 36: Vercel ─────────────────────────────────────────────────────────────
  {
    id: 36, name: 'Vercel', emoji: 'B', description: 'Vercel — чёрно-белый минимализм',
    preview: { bg: '#000000', fg: '#ededed', keyword: '#7b61ff', storage: '#7b61ff',
      constant: '#f5a623', string: '#50e3c2', comment: '#888888',
      number: '#f5a623', funcDef: '#79ffe1', funcCall: '#79ffe1', operator: '#7b61ff' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#7b61ff', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#7b61ff' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#7b61ff', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#f5a623' } },
      { scope: SCOPES.string,    settings: { foreground: '#50e3c2' } },
      { scope: SCOPES.comment,   settings: { foreground: '#888888', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#f5a623' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#79ffe1', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#79ffe1' } },
      { scope: SCOPES.operators, settings: { foreground: '#7b61ff' } },
    ],
  },

  // ── 37: Vesper ─────────────────────────────────────────────────────────────
  {
    id: 37, name: 'Vesper', emoji: 'V', description: 'Vesper — тёплый тёмный минимализм',
    preview: { bg: '#101010', fg: '#cbbba6', keyword: '#ffc799', storage: '#ffc799',
      constant: '#cdbba6', string: '#99c08a', comment: '#606060',
      number: '#ffc799', funcDef: '#ffddaa', funcCall: '#ccccaa', operator: '#ffc799' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#ffc799', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#ffc799' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#ffc799', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#cdbba6' } },
      { scope: SCOPES.string,    settings: { foreground: '#99c08a' } },
      { scope: SCOPES.comment,   settings: { foreground: '#606060', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#ffc799' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#ffddaa', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#ccccaa' } },
      { scope: SCOPES.operators, settings: { foreground: '#ffc799' } },
    ],
  },

  // ── 38: Zenburn ────────────────────────────────────────────────────────────
  {
    id: 38, name: 'Zenburn', emoji: 'Z', description: 'Zenburn — спокойный тёплый серый',
    preview: { bg: '#3f3f3f', fg: '#dcdccc', keyword: '#f0dfaf', storage: '#dfcfaf',
      constant: '#8cd0d3', string: '#cc9393', comment: '#7f9f7f',
      number: '#8cd0d3', funcDef: '#efef8f', funcCall: '#efef8f', operator: '#f0dfaf' },
    rules: [
      { scope: SCOPES.keyword,   settings: { foreground: '#f0dfaf', fontStyle: 'bold' } },
      { scope: SCOPES.storage,   settings: { foreground: '#dfcfaf' } },
      { scope: SCOPES.funcKw,    settings: { foreground: '#dfcfaf', fontStyle: 'italic' } },
      { scope: SCOPES.constant,  settings: { foreground: '#8cd0d3' } },
      { scope: SCOPES.string,    settings: { foreground: '#cc9393' } },
      { scope: SCOPES.comment,   settings: { foreground: '#7f9f7f', fontStyle: 'italic' } },
      { scope: SCOPES.number,    settings: { foreground: '#8cd0d3' } },
      { scope: SCOPES.funcDef,   settings: { foreground: '#efef8f', fontStyle: 'bold' } },
      { scope: SCOPES.funcCall,  settings: { foreground: '#efef8f' } },
      { scope: SCOPES.operators, settings: { foreground: '#f0dfaf' } },
    ],
  },

];

// ── Применение темы через VS Code API ─────────────────────────────────────────

/**
 * Применяет GML тему через editor.tokenColorCustomizations + workbench.colorCustomizations (workspace level).
 * При id=0 — очищает все кастомизации.
 */
export async function applyGmlTheme(themeId: number): Promise<void> {
  const theme = GML_THEMES.find(t => t.id === themeId) ?? GML_THEMES[0];

  const cfg = vscode.workspace.getConfiguration();

  if (theme.rules.length === 0) {
    // Сброс — убираем все наши кастомизации
    await cfg.update('editor.tokenColorCustomizations', undefined, vscode.ConfigurationTarget.Workspace);
    await cfg.update('workbench.colorCustomizations', undefined, vscode.ConfigurationTarget.Workspace);
    logger.info(CTX, 'GML theme reset to default');
    return;
  }

  await cfg.update(
    'editor.tokenColorCustomizations',
    { textMateRules: theme.rules },
    vscode.ConfigurationTarget.Workspace,
  );
  await cfg.update(
    'workbench.colorCustomizations',
    { 'editor.background': theme.preview.bg },
    vscode.ConfigurationTarget.Workspace,
  );
  logger.info(CTX, `GML theme applied: ${theme.name}`, { id: themeId, rules: theme.rules.length });
}
