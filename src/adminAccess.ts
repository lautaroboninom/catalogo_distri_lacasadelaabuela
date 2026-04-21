const FALLBACK_ADMIN_EMAILS = new Set([
  'lautaroboninom@gmail.com',
  'fredy@districorp.com.ar',
]);

export function normalizeEmail(email?: string | null) {
  return (email || '').trim().toLowerCase();
}

export function isFallbackAdminEmail(email?: string | null) {
  return FALLBACK_ADMIN_EMAILS.has(normalizeEmail(email));
}
