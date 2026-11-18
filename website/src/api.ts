import { createClient } from "@supabase/supabase-js";

const url =
  import.meta.env.VITE_SUPABASE_URL ||
  window.ANIVIO_PUBLIC_CONFIG?.supabaseUrl ||
  "";
const key =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  window.ANIVIO_PUBLIC_CONFIG?.supabaseAnonKey ||
  "";
export const configured = Boolean(url && key && !url.includes("your-project"));
export const supabase = configured
  ? createClient(url, key, {
      auth: {
        flowType: "pkce",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "anivio-web-session",
      },
    })
  : null;
export type Row = Record<string, unknown>;
export type Profile = Row & {
  profile_index: number;
  name: string;
  avatar_color_hex: string;
  avatar_url?: string;
  pin_enabled?: boolean;
  uses_primary_addons?: boolean;
  uses_primary_plugins?: boolean;
};
export type Settings = { version: number; features: Record<string, unknown> };

export async function rpc<T = Row[]>(
  name: string,
  params: Row = {},
): Promise<T> {
  if (!supabase)
    throw new Error(
      "Account service is not configured. Add the public Supabase URL and publishable key before deploying.",
    );
  const { data, error } = await supabase.rpc(name, params);
  if (error)
    throw new Error(
      error.message.includes("schema cache") || error.code === "PGRST202"
        ? "This feature needs the Anivio dashboard backend migration. Your existing data has not been changed."
        : error.message,
    );
  return data as T;
}

export const origin = () => `${location.origin}/account/recovery`;
export const profileParams = (id: number) => ({ p_profile_id: id });
export const clientParams = () => ({ p_origin_client_id: "anivio-web" });
export async function getSettings(id: number) {
  const rows = await rpc<{ settings_json: Settings; updated_at: string }[]>(
    "sync_pull_profile_settings_blob",
    { ...profileParams(id), p_platform: "mobile" },
  );
  return (
    rows[0] ?? { settings_json: { version: 5, features: {} }, updated_at: null }
  );
}
export async function readMedia(kind: string, id: number): Promise<Row[]> {
  if (!supabase) throw new Error("Account service is not configured.");
  const table =
    kind === "library"
      ? "library_items"
      : kind === "watched"
        ? "watched_items"
        : "watch_progress";
  const order =
    table === "watch_progress"
      ? "progress_key"
      : table === "watched_items"
        ? "id"
        : "content_id";
  const rows: Row[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("profile_id", id)
      .order(table === "watch_progress" ? "last_watched" : table === "watched_items" ? "watched_at" : "added_at", { ascending: false })
      .order(order)
      .range(offset, offset + 499);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 500) break;
  }
  return rows;
}
export async function saveSettings(
  id: number,
  features: Settings["features"],
  revision: string | null,
) {
  return rpc<string>("web_patch_mobile_settings", {
    ...profileParams(id),
    p_features: features,
    p_expected_updated_at: revision,
  });
}
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ||
      (u.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(u.hostname))
      ? u.href
      : undefined;
  } catch {
    return undefined;
  }
}
export function errorMessage(e: unknown) {
  return e instanceof Error
    ? e.message
    : "Something went wrong. Please try again.";
}
export function downloadJson(name: string, value: unknown) {
  const href = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  a.click();
  URL.revokeObjectURL(href);
}
export function profilePayload(p: Profile): Row {
  return Object.fromEntries(
    [
      "profile_index",
      "name",
      "avatar_color_hex",
      "avatar_id",
      "avatar_url",
      "profile_background_id",
      "profile_background_url",
      "uses_primary_addons",
      "uses_primary_plugins",
    ].map((k) => [k, p[k] ?? (k.startsWith("uses_") ? false : null)]),
  );
}
