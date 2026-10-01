/**
 * Best-effort loading of a local `.env` file. Uses Node's built-in
 * `process.loadEnvFile` (Node >= 20.12) and never throws when the file is
 * absent — CI and production provide real environment variables instead.
 */
export function loadEnvFile(path = '.env'): boolean {
  const maybeLoad = (process as unknown as { loadEnvFile?: (p?: string) => void }).loadEnvFile;
  if (typeof maybeLoad !== 'function') {
    return false;
  }
  try {
    maybeLoad.call(process, path);
    return true;
  } catch {
    // No .env file present, or it could not be read. Environment variables win.
    return false;
  }
}
