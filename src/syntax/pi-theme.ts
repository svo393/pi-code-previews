import type { Theme } from "@earendil-works/pi-coding-agent";
import type { ThemeRegistration } from "shiki";
import { PI_SHIKI_THEME } from "../settings/types";

type ThemeFgToken = Parameters<Theme["getFgAnsi"]>[0];
type ThemeBgToken = Parameters<Theme["getBgAnsi"]>[0];
type SyntaxColorToken = Extract<ThemeFgToken, `syntax${string}`>;

type ScopeRule = {
  token: SyntaxColorToken;
  scopes: readonly string[];
  fontStyle?: string;
};

export type PiShikiTheme = {
  registration: ThemeRegistration;
  key: string;
  light: boolean;
};

const piShikiThemeCache = new WeakMap<Theme, PiShikiTheme>();

/**
 * Shiki/TextMate scopes for each syntax role exposed by pi themes. The base mapping follows
 * pi's own highlight.js-to-theme mapping; the extra JS/TS/JSX scopes mirror the VS Code
 * `tokenColorCustomizations` overrides so previews and the editor agree.
 */
const SCOPE_RULES: readonly ScopeRule[] = [
  {
    token: "syntaxComment",
    scopes: ["comment", "punctuation.definition.comment", "string.comment"],
    fontStyle: "italic",
  },
  {
    token: "syntaxString",
    scopes: [
      "string",
      "string.quoted",
      "string.template",
      "punctuation.definition.string",
      "constant.other.symbol",
      "markup.inline.raw",
      "markup.fenced_code.block",
    ],
  },
  {
    token: "syntaxNumber",
    scopes: [
      "constant.numeric",
      "constant.language",
      "constant.character",
      "constant.other.placeholder",
      "support.constant",
    ],
  },
  {
    token: "syntaxKeyword",
    scopes: [
      "keyword",
      "storage",
      "storage.type",
      "storage.modifier",
      "keyword.control",
      "keyword.other",
      "variable.language.this",
      "variable.language.self",
      "variable.language.super",
      "entity.name.tag",
      "string.unquoted",
      "keyword.operator.typeof",
      "keyword.operator.expression.typeof",
      "meta.embedded.expression",
      "constant.other.object.key",
      "meta.object-literal.key",
    ],
  },
  {
    token: "syntaxFunction",
    scopes: [
      "entity.name.function",
      "entity.name.function.member",
      "support.function",
      "support.class.component",
      "variable.function",
      "meta.function-call",
      "meta.function-call.generic",
      "meta.function-call.object",
      "meta.function-call.static",
      "meta.method-call",
    ],
  },
  {
    token: "syntaxType",
    scopes: [
      "entity.name.type",
      "entity.name.class",
      "entity.name.interface",
      "entity.name.namespace",
      "entity.name.type.alias",
      "entity.other.inherited-class",
      "support.type",
      "support.class",
      "support.other.namespace",
      "meta.type.annotation",
      "storage.type.primitive",
    ],
  },
  {
    token: "syntaxVariable",
    scopes: [
      "variable",
      "variable.other",
      "variable.other.property",
      "support.variable",
      "entity.other.attribute-name",
    ],
  },
  {
    token: "syntaxOperator",
    scopes: ["keyword.operator"],
  },
  {
    token: "syntaxPunctuation",
    scopes: [
      "punctuation",
      "meta.brace",
      "meta.delimiter",
      "meta.bracket",
      "punctuation.section.embedded.begin",
      "punctuation.section.embedded.end",
      "variable.other.readwrite",
      "variable.other.readwrite.alias",
      "variable.other.constant",
      "variable.other.constant.object",
      "variable.other.object",
      "variable.parameter",
    ],
  },
];

const ANSI_BASE_COLORS = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
] as const;

const ANSI_BRIGHT_COLORS = [
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
] as const;

const ANSI_256_CUBE_LEVELS = [0, 95, 135, 175, 215, 255] as const;

export function canCreatePiShikiTheme(theme: Theme | undefined): theme is Theme {
  if (!theme) return false;
  const candidate = theme as Theme & { getFgAnsi?: unknown; getBgAnsi?: unknown };
  return typeof candidate.getFgAnsi === "function" && typeof candidate.getBgAnsi === "function";
}

type ConcreteColor = {
  kind?: string;
  r?: number;
  g?: number;
  b?: number;
  index?: number;
};

export function createPiShikiTheme(theme: Theme): PiShikiTheme {
  const cached = piShikiThemeCache.get(theme);
  if (cached) return cached;
  const colors = concreteThemeColors(theme);
  const type = isLightPiTheme(theme) ? "light" : "dark";
  const foreground =
    parseAnsiForeground(themeFgAnsi(theme, "text")) ?? concreteColorHex(colors?.text);
  const background =
    parseAnsiBackground(themeBgAnsi(theme, "toolPendingBg")) ??
    concreteColorHex(colors?.toolPendingBg);
  const syntaxColors = new Map<SyntaxColorToken, string>();
  const settings: NonNullable<ThemeRegistration["settings"]> = [];

  for (const rule of SCOPE_RULES) {
    const color =
      parseAnsiForeground(themeFgAnsi(theme, rule.token)) ?? concreteColorHex(colors?.[rule.token]);
    if (color) syntaxColors.set(rule.token, color);
    settings.push({
      scope: [...rule.scopes],
      settings: {
        ...(color ? { foreground: color } : {}),
        ...(rule.fontStyle ? { fontStyle: rule.fontStyle } : {}),
      },
    });
  }

  settings.push({
    scope: ["source", "text"],
    settings: foreground ? { foreground } : {},
  });

  const key = [
    type,
    foreground ?? "",
    background ?? "",
    ...SCOPE_RULES.map((rule) => syntaxColors.get(rule.token) ?? ""),
  ].join("|");

  const result: PiShikiTheme = {
    light: type === "light",
    key,
    registration: {
      name: PI_SHIKI_THEME,
      type,
      colors: {
        ...(foreground ? { "editor.foreground": foreground } : {}),
        ...(background ? { "editor.background": background } : {}),
      },
      settings,
    },
  };
  piShikiThemeCache.set(theme, result);
  return result;
}

export function isLightPiTheme(theme: Theme): boolean {
  const appearance = (theme as Theme & { appearance?: unknown }).appearance;
  if (appearance === "light" || appearance === "dark") return appearance === "light";
  const background = parseAnsiBackground(themeBgAnsi(theme, "toolPendingBg"));
  if (background) return relativeLuminance(background) > 0.5;
  const foreground = parseAnsiForeground(themeFgAnsi(theme, "text"));
  if (foreground) return relativeLuminance(foreground) < 0.5;
  return false;
}

function themeFgAnsi(theme: Theme, token: ThemeFgToken): string | undefined {
  try {
    return theme.getFgAnsi(token);
  } catch {
    return undefined;
  }
}

function themeBgAnsi(theme: Theme, token: ThemeBgToken): string | undefined {
  try {
    return theme.getBgAnsi(token);
  } catch {
    return undefined;
  }
}

function concreteThemeColors(theme: Theme): Record<string, ConcreteColor> | undefined {
  try {
    const colors = (theme as Theme & { colors?: unknown }).colors;
    return colors && typeof colors === "object"
      ? (colors as Record<string, ConcreteColor>)
      : undefined;
  } catch {
    return undefined;
  }
}

function concreteColorHex(color: ConcreteColor | undefined): string | undefined {
  if (!color) return undefined;
  if (
    color.kind === "rgb" &&
    color.r !== undefined &&
    color.g !== undefined &&
    color.b !== undefined
  )
    return rgbToHex(color.r, color.g, color.b);
  if (color.kind === "indexed" && color.index !== undefined) return indexedToHex(color.index);
  return undefined;
}

function parseAnsiForeground(value: string | undefined): string | undefined {
  return parseAnsiColor(value, false);
}

function parseAnsiBackground(value: string | undefined): string | undefined {
  return parseAnsiColor(value, true);
}

function parseAnsiColor(value: string | undefined, background: boolean): string | undefined {
  if (!value) return undefined;
  for (const match of value.matchAll(/\x1b\[([0-9;]*)m/g)) {
    const params = match[1]?.split(";").map(Number);
    if (!params?.every(Number.isFinite)) continue;
    const color = sgrColor(params, background);
    if (color) return color;
  }
  return undefined;
}

function sgrColor(params: number[], background: boolean): string | undefined {
  const extended = background ? 48 : 38;
  if (params[0] === extended && params[1] === 2 && params.length >= 5) {
    const [, , red, green, blue] = params;
    if (red !== undefined && green !== undefined && blue !== undefined)
      return rgbToHex(red, green, blue);
    return undefined;
  }
  if (params[0] === extended && params[1] === 5 && params[2] !== undefined) {
    return indexedToHex(params[2]);
  }
  const base = background ? 40 : 30;
  const bright = background ? 100 : 90;
  if (params.length === 1 && params[0] !== undefined) {
    if (params[0] >= base && params[0] <= base + 7) return ANSI_BASE_COLORS[params[0] - base];
    if (params[0] >= bright && params[0] <= bright + 7)
      return ANSI_BRIGHT_COLORS[params[0] - bright];
  }
  return undefined;
}

function indexedToHex(index: number): string | undefined {
  if (index < 0 || index > 255) return undefined;
  if (index < 8) return ANSI_BASE_COLORS[index];
  if (index < 16) return ANSI_BRIGHT_COLORS[index - 8];
  if (index < 232) {
    const cubeIndex = index - 16;
    const red = ANSI_256_CUBE_LEVELS[Math.floor(cubeIndex / 36)];
    const green = ANSI_256_CUBE_LEVELS[Math.floor((cubeIndex % 36) / 6)];
    const blue = ANSI_256_CUBE_LEVELS[cubeIndex % 6];
    if (red !== undefined && green !== undefined && blue !== undefined)
      return rgbToHex(red, green, blue);
    return undefined;
  }
  const level = 8 + (index - 232) * 10;
  return rgbToHex(level, level, level);
}

function rgbToHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))))
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")}`;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const value = Number.parseInt(clean.slice(0, 6), 16);
  if (!Number.isFinite(value)) return 0;
  const channels = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  const [red = 0, green = 0, blue = 0] = channels;
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
