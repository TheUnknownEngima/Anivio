interface ImportMeta {
  readonly env: {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
  };
}
interface Window {
  ANIVIO_PUBLIC_CONFIG?: { supabaseUrl: string; supabaseAnonKey: string };
}
