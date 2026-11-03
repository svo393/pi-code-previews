import assert from "node:assert/strict";
import type { Theme } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, test } from "vitest";
import { defaultCodePreviewSettings } from "../settings/defaults";
import { codePreviewSettings, setCodePreviewSettings } from "../settings/index";
import { PI_SHIKI_THEME } from "../settings/types";
import { canCreatePiShikiTheme, createPiShikiTheme, isLightPiTheme } from "./pi-theme";
import { initializeShiki, isLightShikiTheme, renderWithShiki } from "./shiki";

const PI_SYNTAX_COLORS = {
  text: "#B1B8C6",
  syntaxComment: "#5c6370",
  syntaxKeyword: "#D7A4F4",
  syntaxFunction: "#72BEFF",
  syntaxVariable: "#FF9BA8",
  syntaxString: "#99C479",
  syntaxNumber: "#FFA077",
  syntaxType: "#D6B373",
  syntaxOperator: "#58C9C3",
  syntaxPunctuation: "#B1B8C6",
  toolOutput: "#828997",
} as const;

const PI_BACKGROUNDS = {
  toolPendingBg: "#2f3440",
  userMessageBg: "#2f333d",
} as const;

let previousCodePreviewSettings = { ...codePreviewSettings };

beforeEach(() => {
  previousCodePreviewSettings = { ...codePreviewSettings };
});

afterEach(async () => {
  setCodePreviewSettings(previousCodePreviewSettings);
  await initializeShiki(previousCodePreviewSettings.shikiTheme, piTheme());
});

test.skipIf(Boolean(process.env.CODE_PREVIEW_THEME))(
  "default syntax theme follows the active pi theme",
  () => {
    assert.equal(defaultCodePreviewSettings.shikiTheme, PI_SHIKI_THEME);
  },
);

test("createPiShikiTheme uses the pi theme syntax colors", () => {
  const derived = createPiShikiTheme(piTheme());
  assert.equal(derived.light, false);
  assert.equal(derived.registration.type, "dark");
  assert.equal(ruleForeground(derived.registration, "keyword"), "#d7a4f4");
  assert.equal(ruleForeground(derived.registration, "constant.numeric"), "#ffa077");
  assert.equal(ruleForeground(derived.registration, "string"), "#99c479");
  assert.equal(ruleForeground(derived.registration, "comment"), "#5c6370");
  assert.equal(ruleForeground(derived.registration, "entity.name.function"), "#72beff");
  assert.equal(ruleForeground(derived.registration, "variable.other.property"), "#ff9ba8");
  assert.equal(ruleForeground(derived.registration, "variable.other.readwrite"), "#b1b8c6");
  assert.equal(ruleForeground(derived.registration, "support.class.component"), "#72beff");
});

test("createPiShikiTheme detects light themes from the theme background", () => {
  assert.equal(isLightPiTheme(piTheme({ toolPendingBg: "#ffffff", text: "#222222" })), true);
  assert.equal(
    createPiShikiTheme(piTheme({ toolPendingBg: "#ffffff", text: "#222222" })).light,
    true,
  );
});

test("createPiShikiTheme resolves terminal default colors when available", () => {
  const theme = {
    name: "system",
    fg: (_key: string, text: string) => text,
    bold: (text: string) => text,
    getFgAnsi: () => "\x1b[39m",
    getBgAnsi: () => "\x1b[49m",
    colors: {
      text: { kind: "rgb", r: 229, g: 229, b: 231 },
      toolPendingBg: { kind: "rgb", r: 40, g: 44, b: 52 },
    },
  } as unknown as Theme;
  const derived = createPiShikiTheme(theme);
  assert.equal(ruleForeground(derived.registration, "source"), "#e5e5e7");
  assert.equal(derived.registration.colors?.["editor.foreground"], "#e5e5e7");
  assert.equal(derived.registration.colors?.["editor.background"], "#282c34");
});

test("pi themes render with their own syntax colors", async () => {
  const theme = piTheme();
  setCodePreviewSettings({
    ...codePreviewSettings,
    shikiTheme: PI_SHIKI_THEME,
    syntaxHighlighting: true,
  });
  await initializeShiki(PI_SHIKI_THEME, theme);

  const rendered =
    renderWithShiki("const value: string = 42; // note", "typescript", theme)?.[0] ?? "";
  assert.match(rendered, /\x1b\[38;2;215;164;244mconst/);
  assert.match(rendered, /\x1b\[38;2;177;184;198m[^\x1b]*value/);
  assert.match(rendered, /\x1b\[38;2;214;179;115m string/);
  assert.match(rendered, /\x1b\[38;2;88;201;195m=/);
  assert.match(rendered, /\x1b\[38;2;255;160;119m42/);
  assert.match(rendered, /\x1b\[38;2;177;184;198m;/);
  assert.match(rendered, /\x1b\[38;2;92;99;112m\x1b\[3m\/\/ note/);
  assert.equal(isLightShikiTheme(PI_SHIKI_THEME, theme), false);
});

test("pi theme fallback is used only when the theme exposes color ANSI", () => {
  assert.equal(canCreatePiShikiTheme(piTheme()), true);
  assert.equal(canCreatePiShikiTheme({ fg: (_key, text) => text } as Theme), false);
});

test("pi themes apply the merged VS Code TextMate customizations", async () => {
  const theme = piTheme();
  setCodePreviewSettings({
    ...codePreviewSettings,
    shikiTheme: PI_SHIKI_THEME,
    syntaxHighlighting: true,
  });
  await initializeShiki(PI_SHIKI_THEME, theme);

  const code = [
    'import { readFile as read } from "node:fs";',
    "const obj = { key: value };",
    "function greet(user: User) {",
    "  const t = typeof user.name;",
    "  return new Widget(obj);",
    "}",
  ].join("\n");
  const rendered = (renderWithShiki(code, "typescript", theme) ?? []).join("\n");

  // Function and component names use the accent color.
  assert.match(rendered, /\x1b\[38;2;114;190;255mgreet/);
  assert.match(rendered, /\x1b\[38;2;114;190;255mWidget/);
  // Aliases, constants, objects, and parameters use the punctuation/text color.
  assert.match(rendered, /\x1b\[38;2;177;184;198m[^\x1b]*readFile/);
  assert.match(rendered, /\x1b\[38;2;177;184;198m[^\x1b]*\bread\b/);
  assert.match(rendered, /\x1b\[38;2;177;184;198m[^\x1b]*obj/);
  assert.match(rendered, /\x1b\[38;2;177;184;198m[^\x1b]*user/);
  // Object keys and typeof use the keyword color; properties stay variable-colored.
  assert.match(rendered, /\x1b\[38;2;215;164;244mkey/);
  assert.match(rendered, /\x1b\[38;2;215;164;244mtypeof/);
  assert.match(rendered, /\x1b\[38;2;255;155;168mname/);
  // Assignment operators keep the operator color.
  assert.match(rendered, /\x1b\[38;2;88;201;195m=/);
});

function ruleForeground(
  theme: ReturnType<typeof createPiShikiTheme>["registration"],
  scope: string,
): string | undefined {
  return theme.settings?.find((rule) =>
    Array.isArray(rule.scope) ? rule.scope.includes(scope) : rule.scope === scope,
  )?.settings.foreground;
}

function piTheme(
  overrides: Partial<Record<keyof typeof PI_SYNTAX_COLORS, string>> & {
    toolPendingBg?: string;
  } = {},
): Theme {
  const colors: Record<string, string> = { ...PI_SYNTAX_COLORS, ...overrides };
  const background = overrides.toolPendingBg ?? PI_BACKGROUNDS.toolPendingBg;
  return {
    name: "atom-one-dark-custom",
    fg: (token: string, text: string) =>
      `${foregroundAnsi(colors[token] ?? "#ffffff")}${text}\x1b[39m`,
    bold: (text: string) => `\x1b[1m${text}\x1b[22m`,
    getFgAnsi: (token: string) => foregroundAnsi(colors[token] ?? "#ffffff"),
    getBgAnsi: (token: string) =>
      token === "toolPendingBg" || token === "userMessageBg"
        ? backgroundAnsi(token === "userMessageBg" ? PI_BACKGROUNDS.userMessageBg : background)
        : "",
  } as Theme;
}

function foregroundAnsi(hex: string): string {
  const [red, green, blue] = hexChannels(hex);
  return `\x1b[38;2;${red};${green};${blue}m`;
}

function backgroundAnsi(hex: string): string {
  const [red, green, blue] = hexChannels(hex);
  return `\x1b[48;2;${red};${green};${blue}m`;
}

function hexChannels(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.replace(/^#/, ""), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}
