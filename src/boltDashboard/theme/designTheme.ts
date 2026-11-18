import type { ApprovedDesign, DesignSpecification } from "@/boltDashboard/api/dashboardApi";

export interface ThemeTokens {
  colors: Record<string, string>;
  radii: Record<string, number>;
  shadows: Record<string, string>;
  spacing: Record<string, number>;
  fontStack: string;
  typography: Record<string, Record<string, unknown>>;
}

const FALLBACK_FONT =
  "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif";

export function buildTheme(design: ApprovedDesign): ThemeTokens {
  const spec: DesignSpecification = design.design_specification;

  const colors: Record<string, string> = {};
  for (const [name, token] of Object.entries(spec.color_tokens ?? {})) {
    if (token && typeof token.hex === "string") colors[name] = token.hex;
  }
  for (const [name, token] of Object.entries(spec.semantic_colors ?? {})) {
    if (token && typeof token.hex === "string") colors[`semantic_${name}`] = token.hex;
  }

  return {
    colors,
    radii: spec.radii ?? {},
    shadows: spec.shadows ?? {},
    spacing: spec.spacing ?? {},
    fontStack: FALLBACK_FONT,
    typography: spec.typography ?? {},
  };
}

export const cssVarName = (token: string) => `--dt-${token.replace(/_/g, "-")}`;

export function themeToCssVars(theme: ThemeTokens): React.CSSProperties {
  const style: Record<string, string> = {};
  for (const [name, hex] of Object.entries(theme.colors)) {
    style[cssVarName(name)] = hex;
  }
  for (const [name, px] of Object.entries(theme.radii)) {
    style[cssVarName(`radius-${name}`)] = `${px}px`;
  }
  for (const [name, val] of Object.entries(theme.shadows)) {
    style[cssVarName(`shadow-${name.replace(/^shadow_/, "").replace(/_/g, "-")}`)] = val;
  }
  for (const [name, px] of Object.entries(theme.spacing)) {
    style[cssVarName(`space-${name.replace(/^space_/, "").replace(/_/g, "-")}`)] = `${px}px`;
  }
  style["--dt-font"] = theme.fontStack;
  return style as React.CSSProperties;
}

// Semantic series -> color token mapping from the approved design's semantic_colors.
export function semanticColor(theme: ThemeTokens, semantic: string | null | undefined): string {
  if (!semantic) return theme.colors.chart_neutral ?? "#8A8C98";
  const key = `semantic_${semantic}`;
  if (theme.colors[key]) return theme.colors[key];
  if (theme.colors[semantic]) return theme.colors[semantic];
  return theme.colors.chart_neutral ?? "#8A8C98";
}

export function tokenColor(theme: ThemeTokens, token: string | null | undefined): string {
  if (!token) return theme.colors.chart_neutral ?? "#8A8C98";
  return theme.colors[token] ?? theme.colors.chart_neutral ?? "#8A8C98";
}

export function radius(theme: ThemeTokens, name: string): string {
  const px = theme.radii[name];
  return px != null ? `${px}px` : "12px";
}

export function shadow(theme: ThemeTokens, name: string): string {
  return theme.shadows[name] ?? theme.shadows.shadow_card ?? "none";
}

export function space(theme: ThemeTokens, name: string): number {
  const v = theme.spacing[name];
  return v != null ? v : 16;
}
