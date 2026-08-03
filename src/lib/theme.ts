export type ThemeId =
  | "firsthing"
  | "slideegg"
  | "slideteam"
  | "grafana"
  | "windora";

export type ThemeDef = {
  id: ThemeId;
  label: string;
  /** Swatch preview colors (accent + highlight), used for the theme-switcher buttons only. */
  swatchA: string;
  swatchB: string;
};

export const THEMES: ThemeDef[] = [
  { id: "firsthing", label: "FirsThing brand", swatchA: "#1B7A54", swatchB: "#C7EF4F" },
  { id: "slideegg", label: "SlideEgg light", swatchA: "#4F81A8", swatchB: "#8CC63F" },
  { id: "slideteam", label: "SlideTeam navy", swatchA: "#1E5FA8", swatchB: "#F5A623" },
  { id: "grafana", label: "Grafana dark", swatchA: "#3D71D9", swatchB: "#73BF69" },
  { id: "windora", label: "Windora lime", swatchA: "#2E7D52", swatchB: "#C6F24E" },
];

export const THEME_IDS: ThemeId[] = THEMES.map((t) => t.id);

export const DEFAULT_THEME: ThemeId = "firsthing";

export const THEME_STORAGE_KEY = "ft-theme";

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return !!value && (THEME_IDS as string[]).includes(value);
}
