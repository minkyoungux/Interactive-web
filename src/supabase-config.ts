// Publishable client configuration, safe to include in a static website.
// Database permissions are enforced by RLS, not by hiding this key.
// GitHub Actions / .env.local can override these values for another project.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() || 'https://envvunfvyabiiwurfpoa.supabase.co'
export const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || 'sb_publishable_oLzodQ7rbaUxWS2u78pCSg_6MrgZOEG'
