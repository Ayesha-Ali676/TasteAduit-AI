import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import os from 'os';

// Load environment variables from .env if present (backend or root)
dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  qloo: {
    baseUrl: string;
    apiKey?: string;
  };
}

/**
 * Attempts to retrieve Qloo API key from environment,
 * falling back to local harness configuration (~/.qloo/config) if available.
 */
function resolveQlooApiKey(): string | undefined {
  if (process.env.QLOO_API_KEY && process.env.QLOO_API_KEY.trim().length > 0) {
    return process.env.QLOO_API_KEY.trim();
  }

  // Fallback to local Qloo CLI config file (~/.qloo/config)
  try {
    const qlooConfigPath = path.join(os.homedir(), '.qloo', 'config');
    if (fs.existsSync(qlooConfigPath)) {
      const content = fs.readFileSync(qlooConfigPath, 'utf8');
      const match = content.match(/^api_key\s*=\s*(.+)$/m);
      if (match && match[1]) {
        const parsedKey = match[1].trim();
        if (parsedKey.length > 0 && !parsedKey.startsWith('replace-')) {
          return parsedKey;
        }
      }
    }
  } catch {
    // Silently ignore filesystem reading issues
  }

  return undefined;
}

export function loadConfig(): AppConfig {
  const baseUrl = process.env.QLOO_BASE_URL || 'https://hackathon.api.qloo.com';
  const apiKey = resolveQlooApiKey();

  return {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
    qloo: {
      baseUrl: baseUrl.replace(/\/+$/, ''),
      apiKey
    }
  };
}

export const config = loadConfig();
