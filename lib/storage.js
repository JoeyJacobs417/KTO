// Storage backend met twee modi:
//   - LOCAL (geen KV-env-vars): schrijft naar ./data/<naam>.json
//   - VERCEL KV / Upstash Redis: als KV_REST_API_URL + KV_REST_API_TOKEN
//     (of UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN) aanwezig zijn.
const fs = require('fs');
const path = require('path');

const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const useKv = !!(KV_URL && KV_TOKEN);

let redis = null;
if (useKv) {
  const { Redis } = require('@upstash/redis');
  redis = new Redis({ url: KV_URL, token: KV_TOKEN });
}

function storagePath(name) {
  if (process.env.VERCEL) return `/tmp/${name}.json`;
  return path.join(process.cwd(), 'data', `${name}.json`);
}

function ensureFile(name, defaultValue) {
  const p = storagePath(name);
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify(defaultValue, null, 2), 'utf8');
  return p;
}

async function read(name, defaultValue) {
  if (redis) {
    const val = await redis.get(`survey:${name}`);
    if (val == null) return defaultValue;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return defaultValue; }
    }
    return val; // Upstash kan al auto-deserializen
  }
  const p = ensureFile(name, defaultValue);
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return defaultValue;
  }
}

async function write(name, data) {
  if (redis) {
    await redis.set(`survey:${name}`, JSON.stringify(data));
    return data;
  }
  const p = ensureFile(name, Array.isArray(data) ? [] : {});
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  return data;
}

async function readAll() {
  const r = await read('responses', []);
  return Array.isArray(r) ? r : [];
}

async function append(entry) {
  const all = await readAll();
  all.push(entry);
  await write('responses', all);
  return entry;
}

module.exports = { read, write, readAll, append, storagePath, useKv };
