// db.js — IndexedDBラッパー
// 家計簿アプリのデータ永続化層

const DB_NAME = 'kakeibo_db';
const DB_VERSION = 1;

const STORES = {
  transactions: 'transactions',
  categories: 'categories',
  settings: 'settings',
};

// デフォルトカテゴリ（初回起動時に投入）
const DEFAULT_CATEGORIES = [
  '食費',
  '交通費',
  '日用品',
  '娯楽',
  '光熱費',
  '固定費',
  'その他',
];

/**
 * DBを開く（初回はスキーマ作成）
 * @returns {Promise<IDBDatabase>}
 */
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    // 初回起動 or バージョンアップ時
    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // transactions ストア
      if (!db.objectStoreNames.contains(STORES.transactions)) {
        const tx = db.createObjectStore(STORES.transactions, { keyPath: 'id' });
        tx.createIndex('by_date', 'date', { unique: false });
        tx.createIndex('by_category', 'category_id', { unique: false });
      }

      // categories ストア
      if (!db.objectStoreNames.contains(STORES.categories)) {
        const cat = db.createObjectStore(STORES.categories, { keyPath: 'id' });
        cat.createIndex('by_parent', 'parent_id', { unique: false });
      }

      // settings ストア
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };
  });
}

/**
 * 単一レコード取得
 */
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

/**
 * 全レコード取得
 */
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

/**
 * インデックスで検索
 */
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

/**
 * 範囲検索（例: 日付範囲）
 */
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

/**
 * 追加
 */
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

/**
 * 更新（存在すれば置換、なければ追加）
 */
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

/**
 * 削除
 */
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

/**
 * ストア全削除
 */
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

// ─── 家計簿アプリ用の高レベルAPI ───

/**
 * UUID生成
 */
function generateId() {
  return crypto.randomUUID();
}

/**
 * 現在時刻（ISO8601、JST）
 */
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

/**
 * デフォルトカテゴリを投入（初回起動時のみ）
 */
async function initDefaultCategories() {
  const existing = await getAll(STORES.categories);
  if (existing.length > 0) return; // 既にある場合は何もしない

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

/**
 * 支出記録を追加
 */
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

/**
 * 支出記録を更新
 */
async function updateTransaction(record) {
  return await put(STORES.transactions, record);
}

/**
 * 支出記録を削除
 */
async function deleteTransaction(id) {
  return await remove(STORES.transactions, id);
}

/**
 * 指定期間の支出記録を取得
 */
async function getTransactionsByPeriod(startDate, endDate) {
  return await getByRange(STORES.transactions, 'by_date', startDate, endDate);
}

/**
 * カテゴリを追加
 */
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

/**
 * カテゴリ全取得（階層情報付き）
 */
async function getAllCategories() {
  return await getAll(STORES.categories);
}

/**
 * カテゴリ削除
 */
async function deleteCategory(id) {
  return await remove(STORES.categories, id);
}

/**
 * 全データ削除（設定画面の「全データ削除」用）
 */
async function clearAllData() {
  await clear(STORES.transactions);
  await clear(STORES.categories);
  await clear(STORES.settings);
}

// エクスポート（グローバルに公開）
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
  clearAllData,
  // 低レベルAPIも公開（デバッグ用）
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