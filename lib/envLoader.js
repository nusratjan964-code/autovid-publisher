import fs from 'fs';
import path from 'path';

/**
 * Parses simple .env format into an object
 */
function parseEnvContent(content) {
  const env = {};
  if (!content) return env;

  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx <= 0) continue;

    const key = trimmed.substring(0, eqIdx).trim();
    let val = trimmed.substring(eqIdx + 1).trim();

    // Strip wrapping quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }

    env[key] = val;
  }
  return env;
}

/**
 * Loads .env and .env.local into process.env if not already set
 */
export function loadProjectEnv(cwd = process.cwd()) {
  const envFiles = [
    path.join(cwd, '.env'),
    path.join(cwd, '.env.local')
  ];

  for (const filePath of envFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const raw = fs.readFileSync(filePath, 'utf8');
        const parsed = parseEnvContent(raw);
        for (const [key, val] of Object.entries(parsed)) {
          if (process.env[key] === undefined || process.env[key] === '') {
            process.env[key] = val;
          }
        }
      }
    } catch (e) {
      console.warn(`[EnvLoader] Failed to read ${path.basename(filePath)}:`, e.message);
    }
  }

  // Cross-map Google variables
  if (!process.env.GOOGLE_CLIENT_ID && process.env.VITE_GOOGLE_CLIENT_ID) {
    process.env.GOOGLE_CLIENT_ID = process.env.VITE_GOOGLE_CLIENT_ID;
  }
  if (!process.env.GOOGLE_CLIENT_SECRET && process.env.VITE_GOOGLE_CLIENT_SECRET) {
    process.env.GOOGLE_CLIENT_SECRET = process.env.VITE_GOOGLE_CLIENT_SECRET;
  }

  // Cross-map Facebook variables
  if (!process.env.FB_APP_ID && process.env.VITE_FB_APP_ID) {
    process.env.FB_APP_ID = process.env.VITE_FB_APP_ID;
  }
  if (!process.env.FB_APP_SECRET && process.env.VITE_FB_APP_SECRET) {
    process.env.FB_APP_SECRET = process.env.VITE_FB_APP_SECRET;
  }

  return process.env;
}

/**
 * Persists an environment variable to .env.local and updates process.env
 */
export function saveEnvVariable(key, value, cwd = process.cwd()) {
  if (!key) return false;
  const envLocalPath = path.join(cwd, '.env.local');
  let content = '';

  try {
    if (fs.existsSync(envLocalPath)) {
      content = fs.readFileSync(envLocalPath, 'utf8');
    }
  } catch (e) {}

  const lines = content ? content.split(/\r?\n/) : [];
  let found = false;
  const newLines = lines.map(line => {
    const trimmed = line.trim();
    if (trimmed.startsWith(`${key}=`)) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    newLines.push(`${key}=${value}`);
  }

  try {
    fs.writeFileSync(envLocalPath, newLines.join('\n').trim() + '\n', 'utf8');
    process.env[key] = value;

    // Cross-map if applicable
    if (key === 'FB_APP_ID') process.env.VITE_FB_APP_ID = value;
    if (key === 'FB_APP_SECRET') process.env.VITE_FB_APP_SECRET = value;
    if (key === 'GOOGLE_CLIENT_ID') process.env.VITE_GOOGLE_CLIENT_ID = value;
    if (key === 'GOOGLE_CLIENT_SECRET') process.env.VITE_GOOGLE_CLIENT_SECRET = value;

    return true;
  } catch (err) {
    console.error(`[EnvLoader] Failed to write ${key} to .env.local:`, err.message);
    return false;
  }
}

// Auto-run on import
loadProjectEnv();
