// app.js — メインロジック（画面制御）

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // デフォルトカテゴリの投入
    await KakeiboDB.initDefaultCategories();

    // 日付入力のデフォルト値を今日にする
    const dateInput = document.getElementById('date-input');
    dateInput.value = getTodayString();

    // カテゴリ選択肢を作成
    await populateCategorySelect();

    // 一覧表示
    await refreshTransactionList();

    // フォーム送信イベント登録
    document.getElementById('transaction-form').addEventListener('submit', handleSubmit);

    console.log('app.js 初期化完了');
  } catch (err) {
    console.error('初期化エラー:', err);
    alert('初期化に失敗しました: ' + err.message);
  }
});

/**
 * 今日の日付を YYYY-MM-DD で返す
 */
function getTodayString() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * カテゴリ選択肢を作成
 */
async function populateCategorySelect() {
  const select = document.getElementById('category-select');
  const cats = await KakeiboDB.getAllCategories();

  // 大カテゴリのみ抽出（parent_idがnull）してorder順にソート
  const parentCats = cats
    .filter(c => c.parent_id === null)
    .sort((a, b) => a.order - b.order);

  select.innerHTML = '';
  parentCats.forEach(cat => {
    const option = document.createElement('option');
    option.value = cat.id;
    option.textContent = cat.name;
    select.appendChild(option);
  });
}

/**
 * フォーム送信ハンドラ
 */
async function handleSubmit(event) {
  event.preventDefault();

  const date = document.getElementById('date-input').value;
  const category_id = document.getElementById('category-select').value;
  const amount = document.getElementById('amount-input').value;
  const memo = document.getElementById('memo-input').value;

  try {
    await KakeiboDB.addTransaction({ date, category_id, amount, memo });
    console.log('記録追加成功');

    // フォームをリセット（日付は今日のまま、金額とメモをクリア）
    document.getElementById('amount-input').value = '';
    document.getElementById('memo-input').value = '';

    // 一覧を再描画
    await refreshTransactionList();
  } catch (err) {
    console.error('記録追加エラー:', err);
    alert('記録の追加に失敗しました: ' + err.message);
  }
}

/**
 * 一覧を再描画
 */
async function refreshTransactionList() {
  const listEl = document.getElementById('transaction-list');
  const totalEl = document.getElementById('total-display');

  const transactions = await KakeiboDB.getAll(KakeiboDB.STORES.transactions);
  const categories = await KakeiboDB.getAllCategories();

  // カテゴリIDから名前を引くマップ
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c.name; });

  // 日付降順ソート
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  // 合計計算
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  totalEl.textContent = `合計: ¥${total.toLocaleString()}`;

  // リスト再構築
  listEl.innerHTML = '';

  if (transactions.length === 0) {
    const li = document.createElement('li');
    li.className = 'empty-message';
    li.textContent = 'まだ記録がありません';
    listEl.appendChild(li);
    return;
  }

  transactions.forEach(t => {
    const li = document.createElement('li');
    li.className = 'transaction-item';

    const info = document.createElement('div');
    info.className = 'transaction-info';
    info.innerHTML = `
      <div class="transaction-date">${t.date}</div>
      <div class="transaction-category">${catMap[t.category_id] || '(不明)'}</div>
      ${t.memo ? `<div class="transaction-memo">${escapeHtml(t.memo)}</div>` : ''}
    `;

    const amount = document.createElement('div');
    amount.className = 'transaction-amount';
    amount.textContent = `¥${t.amount.toLocaleString()}`;

    const delBtn = document.createElement('button');
    delBtn.className = 'delete-btn';
    delBtn.textContent = '削除';
    delBtn.addEventListener('click', () => handleDelete(t.id));

    li.appendChild(info);
    li.appendChild(amount);
    li.appendChild(delBtn);
    listEl.appendChild(li);
  });
}

/**
 * 削除ハンドラ
 */
async function handleDelete(id) {
  if (!confirm('この記録を削除しますか？')) return;

  try {
    await KakeiboDB.deleteTransaction(id);
    console.log('記録削除成功:', id);
    await refreshTransactionList();
  } catch (err) {
    console.error('削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

/**
 * HTMLエスケープ（XSS対策）
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}