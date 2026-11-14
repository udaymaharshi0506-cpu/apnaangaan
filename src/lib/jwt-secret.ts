export function getJwtSecret(): Uint8Array {
  const secretSource =
    process.env.AUTH_SECRET ||
    process.env.DATABASE_URL ||
    "local-preview-session";
  return new TextEncoder().encode(secretSource);
}
