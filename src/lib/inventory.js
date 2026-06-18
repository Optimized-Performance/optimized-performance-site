import { getCatalog } from './catalog';

const LOW_STOCK_THRESHOLD = 20;

// In-memory fallback used when Upstash is not configured
const memStore = new Map();

// Lazily seed the fallback map from the DB catalog (async — can't read the
// catalog at module scope anymore now that it's a DB call).
async function initMem() {
  if (memStore.size === 0) {
    const products = await getCatalog();
    products.forEach((p) => memStore.set(p.id, p.stock));
  }
}

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  const { Redis } = require('@upstash/redis');
  return new Redis({ url, token });
}

export async function getAllInventory() {
  const redis = getRedis();
  const products = await getCatalog();
  const result = {};

  if (redis) {
    const pipeline = redis.pipeline();
    products.forEach((p) => pipeline.get(`inv:${p.id}`));
    const values = await pipeline.exec();
    products.forEach((p, i) => {
      result[p.id] = values[i] !== null ? Number(values[i]) : p.stock;
    });
  } else {
    await initMem();
    products.forEach((p) => { result[p.id] = memStore.get(p.id) ?? p.stock; });
  }

  return result;
}

export async function getProductInventory(id) {
  const redis = getRedis();
  if (redis) {
    const val = await redis.get(`inv:${id}`);
    if (val !== null) return Number(val);
    const products = await getCatalog();
    const product = products.find((p) => p.id === id);
    return product?.stock ?? 0;
  }
  await initMem();
  const products = await getCatalog();
  const product = products.find((p) => p.id === id);
  return memStore.get(id) ?? product?.stock ?? 0;
}

export async function setProductInventory(id, quantity) {
  const qty = Math.max(0, Number(quantity));
  const redis = getRedis();
  if (redis) {
    await redis.set(`inv:${id}`, qty);
  } else {
    await initMem();
    memStore.set(id, qty);
  }
  return qty;
}

export async function decrementInventory(id, amount = 1) {
  const current = await getProductInventory(id);
  const next = Math.max(0, current - amount);
  await setProductInventory(id, next);
  return next;
}

export function stockStatus(quantity) {
  if (quantity === 0) return 'out';
  if (quantity <= LOW_STOCK_THRESHOLD) return 'low';
  return 'in';
}

export { LOW_STOCK_THRESHOLD };
