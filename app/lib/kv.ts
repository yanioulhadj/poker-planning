/**
 * Stockage clé/valeur des rooms.
 *
 * - En production (Vercel) : Upstash Redis, partagé entre toutes les instances serverless.
 *   Variables lues : UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN,
 *   ou KV_REST_API_URL / KV_REST_API_TOKEN (noms injectés par l'intégration Vercel).
 * - En local sans ces variables : mémoire du process (perdue au redémarrage).
 */
import { Redis } from '@upstash/redis';

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  hset(key: string, field: string, value: string): Promise<void>;
  hgetall(key: string): Promise<Record<string, string>>;
  hdel(key: string, ...fields: string[]): Promise<void>;
  del(...keys: string[]): Promise<void>;
  expire(keys: string[], ttlSeconds: number): Promise<void>;
}

function createRedisKV(url: string, token: string): KV {
  // automaticDeserialization désactivée : on gère le JSON nous-mêmes
  // (sinon un vote "5" reviendrait sous forme de nombre).
  const redis = new Redis({ url, token, automaticDeserialization: false, enableAutoPipelining: true });

  return {
    async get(key) {
      return redis.get<string>(key);
    },
    async set(key, value, ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds });
    },
    async hset(key, field, value) {
      await redis.hset(key, { [field]: value });
    },
    async hgetall(key) {
      // Sans désérialisation automatique, Upstash renvoie la réponse brute de Redis :
      // une liste à plat [champ1, valeur1, champ2, valeur2, ...].
      const raw = (await redis.hgetall(key)) as unknown;
      if (!raw) return {};
      if (!Array.isArray(raw)) return raw as Record<string, string>;
      const out: Record<string, string> = {};
      for (let i = 0; i < raw.length; i += 2) out[String(raw[i])] = String(raw[i + 1]);
      return out;
    },
    async hdel(key, ...fields) {
      if (fields.length) await redis.hdel(key, ...fields);
    },
    async del(...keys) {
      if (keys.length) await redis.del(...keys);
    },
    async expire(keys, ttlSeconds) {
      await Promise.all(keys.map((k) => redis.expire(k, ttlSeconds)));
    },
  };
}

function createMemoryKV(): KV {
  // Sur globalThis pour survivre au rechargement à chaud en dev.
  const g = globalThis as typeof globalThis & {
    __pokerKV?: { strings: Map<string, string>; hashes: Map<string, Map<string, string>> };
  };
  const store = (g.__pokerKV ??= { strings: new Map(), hashes: new Map() });

  return {
    async get(key) {
      return store.strings.get(key) ?? null;
    },
    async set(key, value) {
      store.strings.set(key, value);
    },
    async hset(key, field, value) {
      if (!store.hashes.has(key)) store.hashes.set(key, new Map());
      store.hashes.get(key)!.set(field, value);
    },
    async hgetall(key) {
      return Object.fromEntries(store.hashes.get(key) ?? []);
    },
    async hdel(key, ...fields) {
      const h = store.hashes.get(key);
      fields.forEach((f) => h?.delete(f));
    },
    async del(...keys) {
      keys.forEach((k) => {
        store.strings.delete(k);
        store.hashes.delete(k);
      });
    },
    async expire() {
      // Pas d'expiration en mémoire (usage local uniquement).
    },
  };
}

function createKV(): KV {
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) return createRedisKV(url, token);

  if (process.env.VERCEL) {
    console.error(
      '[poker-planning] Aucun Redis configuré : les rooms sont stockées en mémoire et ' +
        'disparaîtront entre les instances Vercel. Ajoutez Upstash Redis (UPSTASH_REDIS_REST_URL / _TOKEN).'
    );
  }
  return createMemoryKV();
}

export const kv: KV = createKV();
