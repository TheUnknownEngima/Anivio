import nativeFields from "./generated-settings.json";
export type Field = {
  feature: string;
  key: string;
  title: string;
  type: "boolean" | "int" | "float" | "string" | "stringset";
  options?: string[];
  default?: unknown;
  description?: string;
  storage?: "json";
};
export const settingGroups: Record<string, Field[]> = {
  Appearance: [
    {
      feature: "theme_settings",
      key: "selected_theme",
      title: "Theme",
      type: "string",
      options: [
        "WHITE",
        "CRIMSON",
        "OCEAN",
        "VIOLET",
        "EMERALD",
        "AMBER",
        "ROSE",
        "GOLD",
        "JADE",
        "ROSE_GOLD",
        "ARCTIC_BLUE",
        "GRAPHITE",
        "CUSTOM",
      ],
      default: "WHITE",
    },
    {
      feature: "theme_settings",
      key: "amoled_enabled",
      title: "Pure black backgrounds",
      type: "boolean",
    },
    {
      feature: "theme_settings",
      key: "nav_bar_glow_enabled",
      title: "Navigation glow",
      type: "boolean",
      default: true,
    },
  ],
  Playback: [
    {
      feature: "player_settings",
      key: "preferred_audio_language",
      title: "Preferred audio language",
      type: "string",
      options: ["ja", "en", "hi", "ko", "fr", "de", "es"],
      default: "ja",
    },
    {
      feature: "player_settings",
      key: "secondary_preferred_audio_language",
      title: "Second audio language",
      type: "string",
      default: "en",
    },
    {
      feature: "player_settings",
      key: "hold_to_speed_enabled",
      title: "Hold to speed up",
      type: "boolean",
      default: true,
    },
    {
      feature: "player_settings",
      key: "touch_gestures_enabled",
      title: "Touch gestures",
      type: "boolean",
      default: true,
    },
    {
      feature: "player_settings",
      key: "show_pause_overlay",
      title: "Show details when paused",
      type: "boolean",
      default: true,
    },
    {
      feature: "player_settings",
      key: "still_watching_enabled",
      title: "Still watching reminder",
      type: "boolean",
    },
  ],
  Discovery: [
    {
      feature: "tmdb_settings",
      key: "tmdb_enabled",
      title: "TMDB metadata",
      type: "boolean",
      default: true,
    },
    {
      feature: "tmdb_settings",
      key: "tmdb_use_artwork",
      title: "TMDB artwork",
      type: "boolean",
      default: true,
    },
    {
      feature: "mdblist_settings",
      key: "mdblist_enabled",
      title: "MDBList ratings",
      type: "boolean",
    },
  ],
  Notifications: [
    {
      feature: "notifications_settings",
      key: "episode_release_alerts_enabled",
      title: "Episode release alerts",
      type: "boolean",
    },
  ],
};
const selections: Record<string, string[]> = {
  subtitle_font_family: ["default", "sans", "serif", "monospace"],
  nav_bar_style: ["adaptive", "expanded", "compact", "classic"],
  video_enhancement: [
    "Off",
    "Light",
    "Anime4kA",
    "Anime4kB",
    "Anime4kC",
    "Fsrcnnx",
    "Anime4kGan",
  ],
  enhancement_resolution: ["FullHd", "Native2k"],
};
for (const native of nativeFields) {
  if (native.key === "custom_theme_colors") continue; // Dedicated three-stop editor.
  const group = (settingGroups[native.group] ||= []);
  if (!group.some((f) => f.feature === native.feature && f.key === native.key))
    group.push({
      ...native,
      type: native.type as Field["type"],
      options: selections[native.key],
    });
}
settingGroups.Reader = [
  {
    feature: "manga_reader_settings_payload",
    key: "readingMode",
    title: "Reading direction",
    type: "string",
    storage: "json",
    options: ["WEBTOON", "LEFT_TO_RIGHT", "RIGHT_TO_LEFT"],
    default: "WEBTOON",
  },
  {
    feature: "manga_reader_settings_payload",
    key: "imageScaleMode",
    title: "Page scaling",
    type: "string",
    storage: "json",
    options: ["FIT_WIDTH", "FIT_SCREEN", "ORIGINAL"],
    default: "FIT_WIDTH",
  },
  {
    feature: "manga_reader_settings_payload",
    key: "autoAdvanceChapters",
    title: "Automatically advance chapters",
    type: "boolean",
    storage: "json",
    default: false,
  },
  {
    feature: "manga_reader_settings_payload",
    key: "dataSaverEnabled",
    title: "Reader data saver",
    type: "boolean",
    storage: "json",
    default: false,
  },
];
