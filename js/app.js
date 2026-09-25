// app.js — メインロジック（画面制御、カレンダー描画、モーダル）

// 状態管理
const state = {
  currentPage: 'calendar',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1, // 1-indexed
  selectedDate: null,
  editingTransactionId: null,
};

// ─── 初期化 ───
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await KakeiboDB.initDefaultCategories();
    await populateCategorySelect();
    setupTabNavigation();
    setupCalendarNavigation();
    setupModals();
    setupForm();
    await renderCalendar();
    console.log('app.js 初期化完了');
  } catch (err) {
    console.error('初期化エラー:', err);
    alert('初期化に失敗しました: ' + err.message);
  }
});

// ─── 共通ユーティリティ ───

function getTodayString() {
  const d = new Date();
  return formatDate(d);
}

function formatDate(d) {
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateJP(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
  return `${m}月${d}日（${weekdays[date.getDay()]}）`;
}

// ─── タブ切り替え ───

function setupTabNavigation() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pageId = btn.dataset.page;
      switchPage(pageId);
    });
  });
}

function switchPage(pageId) {
  state.currentPage = pageId;

  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${pageId}`).classList.add('active');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });
}

// ─── カレンダー ───

function setupCalendarNavigation() {
  document.getElementById('prev-month').addEventListener('click', () => {
    state.currentMonth--;
    if (state.currentMonth < 1) {
      state.currentMonth = 12;
      state.currentYear--;
    }
    renderCalendar();
  });

  document.getElementById('next-month').addEventListener('click', () => {
    state.currentMonth++;
    if (state.currentMonth > 12) {
      state.currentMonth = 1;
      state.currentYear++;
    }
    renderCalendar();
  });

  document.getElementById('today-btn').addEventListener('click', () => {
    const now = new Date();
    state.currentYear = now.getFullYear();
    state.currentMonth = now.getMonth() + 1;
    renderCalendar();
  });
}

async function renderCalendar() {
  const { currentYear: y, currentMonth: m } = state;

  document.getElementById('current-month').textContent = `${y}年${m}月`;

  // 当月の記録を取得
  const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const transactions = await KakeiboDB.getTransactionsByPeriod(startDate, endDate);

  // 日別集計
  const dailyTotals = {};
  transactions.forEach(t => {
    dailyTotals[t.date] = (dailyTotals[t.date] || 0) + t.amount;
  });

  // 月合計
  const monthTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('month-total-amount').textContent = `¥${monthTotal.toLocaleString()}`;

  // カレンダー描画
  const container = document.getElementById('calendar-container');
  container.innerHTML = '';

  // 曜日ヘッダー
  const headerRow = document.createElement('div');
  headerRow.className = 'calendar-header';
  ['日', '月', '火', '水', '木', '金', '土'].forEach((wd, i) => {
    const el = document.createElement('div');
    el.className = 'calendar-weekday';
    if (i === 0) el.classList.add('sunday');
    if (i === 6) el.classList.add('saturday');
    el.textContent = wd;
    headerRow.appendChild(el);
  });
  container.appendChild(headerRow);

  // 日付マス
  const firstDay = new Date(y, m - 1, 1).getDay();
  const totalCells = Math.ceil((firstDay + lastDay) / 7) * 7;
  const today = getTodayString();

  let currentRow = document.createElement('div');
  currentRow.className = 'calendar-row';
  container.appendChild(currentRow);

  for (let i = 0; i < totalCells; i++) {
    if (i > 0 && i % 7 === 0) {
      currentRow = document.createElement('div');
      currentRow.className = 'calendar-row';
      container.appendChild(currentRow);
    }

    const dayNum = i - firstDay + 1;
    const cell = document.createElement('div');
    cell.className = 'calendar-cell';

    if (dayNum < 1 || dayNum > lastDay) {
      cell.classList.add('other-month');
      currentRow.appendChild(cell);
      continue;
    }

    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const dayOfWeek = new Date(y, m - 1, dayNum).getDay();
    const isHolidayDay = KakeiboHolidays.isHoliday(dateStr);

    if (dateStr === today) cell.classList.add('today');

    const dateSpan = document.createElement('span');
    dateSpan.className = 'cell-date';
    if (dayOfWeek === 0 || isHolidayDay) dateSpan.classList.add('sunday');
    if (dayOfWeek === 6) dateSpan.classList.add('saturday');
    dateSpan.textContent = dayNum;
    cell.appendChild(dateSpan);

    if (dailyTotals[dateStr]) {
      const amountSpan = document.createElement('span');
      amountSpan.className = 'cell-amount';
      amountSpan.textContent = `¥${dailyTotals[dateStr].toLocaleString()}`;
      cell.appendChild(amountSpan);
    }

    cell.addEventListener('click', () => openDateModal(dateStr));
    currentRow.appendChild(cell);
  }
}

// ─── モーダル管理 ───

function setupModals() {
  document.getElementById('modal-close').addEventListener('click', closeDateModal);
  document.querySelector('#date-modal .modal-overlay').addEventListener('click', closeDateModal);
  document.getElementById('add-transaction-btn').addEventListener('click', () => openFormModal(state.selectedDate));

  document.getElementById('form-back-btn').addEventListener('click', closeFormModal);
  document.querySelector('#form-modal .modal-overlay').addEventListener('click', closeFormModal);
  document.getElementById('form-save-btn').addEventListener('click', handleSave);
  document.getElementById('form-delete-btn').addEventListener('click', handleDelete);
}

async function openDateModal(dateStr) {
  state.selectedDate = dateStr;
  document.getElementById('modal-date-title').textContent = formatDateJP(dateStr);
  await renderDateModalBody();
  document.getElementById('date-modal').classList.add('active');
}

function closeDateModal() {
  document.getElementById('date-modal').classList.remove('active');
}

async function renderDateModalBody() {
  const body = document.getElementById('modal-body');
  const allTransactions = await KakeiboDB.getAll(KakeiboDB.STORES.transactions);
  const dateTransactions = allTransactions.filter(t => t.date === state.selectedDate);

  const categories = await KakeiboDB.getAllCategories();
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c.name; });

  body.innerHTML = '';

  if (dateTransactions.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty-message';
    p.textContent = 'この日の記録はありません';
    body.appendChild(p);
    return;
  }

  const totalEl = document.createElement('div');
  totalEl.style.textAlign = 'right';
  totalEl.style.padding = '8px 0 16px';
  totalEl.style.fontSize = '14px';
  totalEl.style.color = '#666';
  const dayTotal = dateTransactions.reduce((s, t) => s + t.amount, 0);
  totalEl.innerHTML = `この日の合計: <strong>¥${dayTotal.toLocaleString()}</strong>`;
  body.appendChild(totalEl);

  dateTransactions.forEach(t => {
    const card = document.createElement('div');
    card.className = 'record-card';
    card.innerHTML = `
      <div class="record-info">
        <div class="record-category">${catMap[t.category_id] || '(不明)'}</div>
        ${t.memo ? `<div class="record-memo">${escapeHtml(t.memo)}</div>` : ''}
      </div>
      <div class="record-amount">¥${t.amount.toLocaleString()}</div>
    `;
    card.addEventListener('click', () => openFormModal(state.selectedDate, t));
    body.appendChild(card);
  });
}

function openFormModal(dateStr, transaction = null) {
  state.editingTransactionId = transaction ? transaction.id : null;

  document.getElementById('form-title').textContent = transaction ? '編集' : '新規追加';
  document.getElementById('form-delete-btn').style.display = transaction ? 'block' : 'none';

  document.getElementById('date-input').value = transaction ? transaction.date : dateStr;
  document.getElementById('category-select').value = transaction ? transaction.category_id : '';
  document.getElementById('amount-input').value = transaction ? transaction.amount : '';
  document.getElementById('memo-input').value = transaction ? transaction.memo : '';

  document.getElementById('form-modal').classList.add('active');
}

function closeFormModal() {
  document.getElementById('form-modal').classList.remove('active');
  state.editingTransactionId = null;
}

async function handleSave() {
  const date = document.getElementById('date-input').value;
  const category_id = document.getElementById('category-select').value;
  const amount = document.getElementById('amount-input').value;
  const memo = document.getElementById('memo-input').value;

  if (!date || !category_id || !amount) {
    alert('日付・カテゴリ・金額は必須です');
    return;
  }

  try {
    if (state.editingTransactionId) {
      // 編集
      const existing = await KakeiboDB.get(KakeiboDB.STORES.transactions, state.editingTransactionId);
      await KakeiboDB.updateTransaction({
        ...existing,
        date,
        category_id,
        amount: parseInt(amount, 10),
        memo,
      });
    } else {
      // 新規
      await KakeiboDB.addTransaction({ date, category_id, amount, memo });
    }

    closeFormModal();
    await renderDateModalBody();
    await renderCalendar();
  } catch (err) {
    console.error('保存エラー:', err);
    alert('保存に失敗しました: ' + err.message);
  }
}

async function handleDelete() {
  if (!state.editingTransactionId) return;
  if (!confirm('この記録を削除しますか？')) return;

  try {
    await KakeiboDB.deleteTransaction(state.editingTransactionId);
    closeFormModal();
    await renderDateModalBody();
    await renderCalendar();
  } catch (err) {
    console.error('削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

// ─── フォーム関連 ───

async function populateCategorySelect() {
  const select = document.getElementById('category-select');
  const cats = await KakeiboDB.getAllCategories();
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

function setupForm() {
  // フォーム送信で保存
  document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSave();
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}