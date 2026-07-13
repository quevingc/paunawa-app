/**
 * supabaseClient.js
 * Initializes the Supabase client used by api.js. Requires the
 * supabase-js library to be loaded first (see index.html <script> tag)
 * and CONFIG.SUPABASE_URL / CONFIG.SUPABASE_ANON_KEY to be set.
 */

const SupabaseClient = (() => {
  if (
    !CONFIG.SUPABASE_URL ||
    CONFIG.SUPABASE_URL.includes("PASTE_YOUR") ||
    !CONFIG.SUPABASE_ANON_KEY ||
    CONFIG.SUPABASE_ANON_KEY.includes("PASTE_YOUR")
  ) {
    console.warn(
      "Supabase is not configured yet. Set CONFIG.SUPABASE_URL and CONFIG.SUPABASE_ANON_KEY in js/config.js."
    );
    return null;
  }
  // `supabase` here is the global exposed by the supabase-js UMD bundle
  return supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
})();
