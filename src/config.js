import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

export const DEFAULT_INFO_FILE = 'data/campus-info.md';
export const DEFAULT_LLM_BASE_URL = 'https://api.openai.com/v1';
export const DEFAULT_LLM_MODEL = 'gpt-4.1-mini';

// Loads KEY=VALUE lines from a .env file into process.env.
// Variables that are already set in the environment take priority.
export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (!process.env[key]) {
      process.env[key] = rawValue.replace(/^(["'])(.*)\1$/, '$2');
    }
  }
}

export function readConfig(env, projectDir) {
  const apiKey = (env.LLM_API_KEY || '').trim();
  return {
    host: (env.HOST || '0.0.0.0').trim(),
    port: parsePort(env.PORT),
    infoFile: path.resolve(projectDir, env.CAMPUS_INFO_FILE || DEFAULT_INFO_FILE),
    // AI answers are optional. Without a key, CampusBuddy uses built-in keyword matching.
    llm: apiKey
      ? {
          apiKey,
          baseUrl: (env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL).trim().replace(/\/+$/, ''),
          model: (env.LLM_MODEL || DEFAULT_LLM_MODEL).trim(),
        }
      : null,
  };
}

function parsePort(value) {
  if (value === undefined || value === '') return 3000;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be a whole number from 1 to 65535 (got "${value}").`);
  }
  return port;
}
