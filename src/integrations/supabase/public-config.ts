// Public Supabase project configuration used by browser-safe clients.
// Publishable keys are intentionally safe to ship to the browser when RLS is enforced.
// Environment variables still take precedence so each deployment can override the defaults.
export const SUPABASE_PUBLIC_URL =
  import.meta.env["VITE_SUPABASE_URL"] || "https://knafqmnizipfpiciezpd.supabase.co";

export const SUPABASE_PUBLIC_PUBLISHABLE_KEY =
  import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] ||
  "sb_publishable_LCDH9alzKaXz2Ve5jwiAVg_6__qk2EA";
