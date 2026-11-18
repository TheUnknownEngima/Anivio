import type { Settings } from "./api";

const themeStops: Record<string, string[]> = {
  WHITE: ["#f5f5f5", "#aab2be", "#687381"],
  CRIMSON: ["#ff5252", "#e53935", "#c62828"],
  OCEAN: ["#42a5f5", "#1e88e5", "#1565c0"],
  VIOLET: ["#ab47bc", "#8e24aa", "#6a1b9a"],
  EMERALD: ["#66bb6a", "#43a047", "#2e7d32"],
  AMBER: ["#ffa726", "#fb8c00", "#ef6c00"],
  ROSE: ["#ec407a", "#d81b60", "#c2185b"],
  GOLD: ["#8a5700", "#e8a91c", "#fff1a8", "#ffd45c", "#9a6200"],
  JADE: ["#7bf08d", "#22d37c", "#0bbf9a"],
  ROSE_GOLD: ["#b75aff", "#ec70a9", "#ffb37a"],
  ARCTIC_BLUE: ["#4de3ff", "#3185f5", "#4d55e8"],
  GRAPHITE: ["#f3f5f7", "#aab2be", "#687381"],
};

export function supporterGradient(features: Settings["features"]) {
  const theme = features.theme_settings as Record<string, { value?: string }> | undefined;
  const selected = theme?.selected_theme?.value || "WHITE";
  let stops = themeStops[selected] || themeStops.WHITE;
  if (selected === "CUSTOM") {
    const colors = theme?.custom_theme_colors?.value?.split(",").map(color => color.trim());
    if (colors?.length === 3 && colors.every(color => /^#?(?:[\da-f]{6}|[\da-f]{8})$/i.test(color))) {
      stops = colors.map(color => `#${color.slice(-6)}`);
    }
  }
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}
