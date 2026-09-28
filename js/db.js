// db.js — IndexedDBラッパー
// 家計簿アプリのデータ永続化層

const DB_NAME = 'kakeibo_db';
const DB_VERSION = 2; // v1 → v2: recurring_transactions ストア追加

const STORES = {
  transactions: 'transactions',
  categories: 'categories',
  settings: 'settings',
  recurring: 'recurring_transactions',
};

const DEFAULT_CATEGORIES = [
  '食費',
  '交通費',
  '日用品',
  '娯楽',
  '光熱費',
  '固定費',
  'その他',
];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.transactions)) {
        const tx = db.createObjectStore(STORES.transactions, { keyPath: 'id' });
        tx.createIndex('by_date', 'date', { unique: false });
        tx.createIndex('by_category', 'category_id', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.categories)) {
        const cat = db.createObjectStore(STORES.categories, { keyPath: 'id' });
        cat.createIndex('by_parent', 'parent_id', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }

      // v2で追加: 固定費テンプレート
      if (!db.objectStoreNames.contains(STORES.recurring)) {
        db.createObjectStore(STORES.recurring, { keyPath: 'id' });
      }
    };
  });
}

function get(storeName, key) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function getAll(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function getByIndex(storeName, indexName, value) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const request = index.getAll(value);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function getByRange(storeName, indexName, lower, upper) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const index = store.index(indexName);
      const range = IDBKeyRange.bound(lower, upper);
      const request = index.getAll(range);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  });
}

function add(storeName, record) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.add(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  });
}

function put(storeName, record) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.put(record);
      request.onsuccess = () => resolve(record);
      request.onerror = () => reject(request.error);
    });
  });
}

function remove(storeName, key) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.delete(key);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

function clear(storeName) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
}

// ─── 高レベルAPI ───

function generateId() {
  return crypto.randomUUID();
}

function now() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const y = d.getFullYear();
  const m = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const h = pad(d.getHours());
  const mi = pad(d.getMinutes());
  const s = pad(d.getSeconds());
  return `${y}-${m}-${day}T${h}:${mi}:${s}+09:00`;
}

async function initDefaultCategories() {
  const existing = await getAll(STORES.categories);
  if (existing.length > 0) return;

  const promises = DEFAULT_CATEGORIES.map((name, index) => {
    return add(STORES.categories, {
      id: generateId(),
      name,
      parent_id: null,
      order: index + 1,
      created_at: now(),
    });
  });

  await Promise.all(promises);
  console.log('デフォルトカテゴリを投入しました');
}

async function addTransaction({ date, category_id, amount, memo = '' }) {
  const record = {
    id: generateId(),
    date,
    category_id,
    amount: parseInt(amount, 10),
    memo,
    created_at: now(),
  };
  return await add(STORES.transactions, record);
}

async function updateTransaction(record) {
  return await put(STORES.transactions, record);
}

async function deleteTransaction(id) {
  return await remove(STORES.transactions, id);
}

async function getTransactionsByPeriod(startDate, endDate) {
  return await getByRange(STORES.transactions, 'by_date', startDate, endDate);
}

async function addCategory({ name, parent_id = null }) {
  const existing = await getAll(STORES.categories);
  const order = existing.length + 1;
  const record = {
    id: generateId(),
    name,
    parent_id,
    order,
    created_at: now(),
  };
  return await add(STORES.categories, record);
}

async function getAllCategories() {
  return await getAll(STORES.categories);
}

async function deleteCategory(id) {
  return await remove(STORES.categories, id);
}

// ─── 固定費テンプレート ───

async function addRecurring({ frequency, day_of_month, day_of_week, category_id, amount, memo, start_date }) {
  const record = {
    id: generateId(),
    frequency,
    day_of_month: day_of_month ?? null,
    day_of_week: day_of_week ?? null,
    category_id,
    amount: parseInt(amount, 10),
    memo: memo || '',
    start_date,
    last_generated_date: null, // 初回はまだ未生成
    created_at: now(),
    updated_at: now(),
  };
  return await add(STORES.recurring, record);
}

async function updateRecurring(record) {
  record.updated_at = now();
  return await put(STORES.recurring, record);
}

async function deleteRecurring(id) {
  return await remove(STORES.recurring, id);
}

async function getAllRecurring() {
  return await getAll(STORES.recurring);
}

async function clearAllData() {
  await clear(STORES.transactions);
  await clear(STORES.categories);
  await clear(STORES.settings);
  await clear(STORES.recurring);
}

window.KakeiboDB = {
  openDB,
  initDefaultCategories,
  addTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionsByPeriod,
  addCategory,
  getAllCategories,
  deleteCategory,
  addRecurring,
  updateRecurring,
  deleteRecurring,
  getAllRecurring,
  clearAllData,
  get,
  getAll,
  getByIndex,
  add,
  put,
  remove,
  clear,
  STORES,
};

console.log('db.js 読み込み完了');