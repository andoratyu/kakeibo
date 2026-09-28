// app.js — メインロジック

const state = {
  currentPage: 'calendar',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  homeYear: new Date().getFullYear(),
  homeMonth: new Date().getMonth() + 1,
  selectedDate: null,
  editingTransactionId: null,
  editingRecurringId: null,
  currentFrequency: 'monthly',
  homeChart: null,
};

// ─── カテゴリ色 ───

const CATEGORY_COLOR_PALETTE = [
  '#7a9b7e',
  '#6b8caf',
  '#b58471',
  '#8b7ba5',
  '#b8a870',
  '#8b7355',
  '#8f8f8f',
  '#b58097',
  '#7ba5a5',
  '#9b9b6f',
];

const DEFAULT_CATEGORY_COLORS = {
  '食費': 0,
  '交通費': 1,
  '日用品': 2,
  '娯楽': 3,
  '光熱費': 4,
  '固定費': 5,
  'その他': 6,
};

function getCategoryColor(name) {
  if (DEFAULT_CATEGORY_COLORS.hasOwnProperty(name)) {
    return CATEGORY_COLOR_PALETTE[DEFAULT_CATEGORY_COLORS[name]];
  }
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  const index = Math.abs(hash) % CATEGORY_COLOR_PALETTE.length;
  return CATEGORY_COLOR_PALETTE[index];
}

// ─── 初期化 ───

document.addEventListener('DOMContentLoaded', async () => {
  try {
    document.getElementById('version-badge').textContent = window.APP_VERSION || 'v?';

    await KakeiboDB.initDefaultCategories();
    await populateCategorySelect();

    // 固定費テンプレートから自動生成（起動時に必ず実行）
    const generatedCount = await generateRecurringTransactions();
    if (generatedCount > 0) {
      console.log(`固定費から ${generatedCount} 件を自動追加しました`);
    }

    setupTabNavigation();
    setupCalendarNavigation();
    setupHomeNavigation();
    setupModals();
    setupRecurringModal();
    setupForm();
    populateDayOfMonthSelect();
    await renderCalendar();
    await renderHome();
    console.log('app.js 初期化完了 バージョン:', window.APP_VERSION);
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

function getMonthRange(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate, lastDay };
}

function getPrevMonth(year, month) {
  if (month === 1) {
    return { year: year - 1, month: 12 };
  }
  return { year, month: month - 1 };
}

async function getPrevMonthTransactions(year, month) {
  const prev = getPrevMonth(year, month);
  const range = getMonthRange(prev.year, prev.month);
  return await KakeiboDB.getTransactionsByPeriod(range.startDate, range.endDate);
}

function formatMonthDiff(currentTotal, prevTotal) {
  if (prevTotal === 0) {
    return { text: '前月比 -', cssClass: 'same' };
  }
  const diff = currentTotal - prevTotal;
  if (diff === 0) {
    return { text: '前月比 ±0円', cssClass: 'same' };
  }
  const percent = Math.round((diff / prevTotal) * 100);
  if (diff > 0) {
    return {
      text: `前月比 +${diff.toLocaleString()}円 ↑ (+${percent}%)`,
      cssClass: 'increase',
    };
  } else {
    return {
      text: `前月比 ${diff.toLocaleString()}円 ↓ (${percent}%)`,
      cssClass: 'decrease',
    };
  }
}

function formatCategoryDiff(current, prev) {
  if (prev === 0) {
    return { text: '新規', cssClass: 'new' };
  }
  const diff = current - prev;
  if (diff === 0) {
    return { text: '±0円', cssClass: 'same' };
  }
  const percent = Math.round((diff / prev) * 100);
  if (diff > 0) {
    return {
      text: `+${diff.toLocaleString()}円 ↑ (+${percent}%)`,
      cssClass: 'increase',
    };
  } else {
    return {
      text: `${diff.toLocaleString()}円 ↓ (${percent}%)`,
      cssClass: 'decrease',
    };
  }
}

function updateMonthDiff(elementId, currentTotal, prevTotal) {
  const el = document.getElementById(elementId);
  const { text, cssClass } = formatMonthDiff(currentTotal, prevTotal);
  el.textContent = text;
  el.className = `month-diff ${cssClass}`;
}

function getAmountFontSize(amount) {
  const text = `${amount.toLocaleString()}円`;
  const len = text.length;
  if (len <= 4) return '12px';
  if (len <= 5) return '11px';
  if (len <= 6) return '10px';
  if (len <= 7) return '9px';
  if (len <= 8) return '8px';
  return '7px';
}

function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return formatDate(date);
}

// ─── 固定費: 自動生成 ───

/**
 * 起動時に呼ぶ: 各テンプレートについて last_generated_date+1日 〜 today までの該当日を全部生成
 * @returns {Promise<number>} 生成した件数
 */
async function generateRecurringTransactions() {
  const templates = await KakeiboDB.getAllRecurring();
  if (templates.length === 0) return 0;

  const today = getTodayString();
  const categories = await KakeiboDB.getAllCategories();
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c; });

  let totalGenerated = 0;

  for (const template of templates) {
    // カテゴリが削除されていたらスキップ
    if (!catMap[template.category_id]) continue;

    // 生成開始日を決定
    let startDate;
    if (template.last_generated_date) {
      startDate = addDays(template.last_generated_date, 1);
    } else {
      startDate = template.start_date;
    }

    // 未来ならスキップ
    if (startDate > today) continue;

    // 該当日を計算
    const dates = calculateRecurringDates(template, startDate, today);

    for (const date of dates) {
      await KakeiboDB.addTransaction({
        date,
        category_id: template.category_id,
        amount: template.amount,
        memo: template.memo || '',
      });
      totalGenerated++;
    }

    // last_generated_date を today に更新
    template.last_generated_date = today;
    await KakeiboDB.updateRecurring(template);
  }

  return totalGenerated;
}

/**
 * テンプレートから該当日リストを計算（startDate 〜 endDate、両端含む）
 */
function calculateRecurringDates(template, startDate, endDate) {
  const dates = [];
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);

  if (template.frequency === 'daily') {
    const d = new Date(start);
    while (d <= end) {
      dates.push(formatDate(d));
      d.setDate(d.getDate() + 1);
    }
  } else if (template.frequency === 'weekday') {
    // 平日（月〜金）かつ祝日でない日のみ
    const d = new Date(start);
    while (d <= end) {
      const dayOfWeek = d.getDay();
      const dateStr = formatDate(d);
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && !KakeiboHolidays.isHoliday(dateStr)) {
        dates.push(dateStr);
      }
      d.setDate(d.getDate() + 1);
    }
  } else if (template.frequency === 'weekly') {
    const w = new Date(start);
    while (w.getDay() !== template.day_of_week && w <= end) {
      w.setDate(w.getDate() + 1);
    }
    while (w <= end) {
      dates.push(formatDate(w));
      w.setDate(w.getDate() + 7);
    }
  } else if (template.frequency === 'monthly') {
    let m = new Date(start.getFullYear(), start.getMonth(), 1);
    while (m <= end) {
      const year = m.getFullYear();
      const month = m.getMonth();
      const lastDayOfMonth = new Date(year, month + 1, 0).getDate();
      const targetDay = Math.min(template.day_of_month, lastDayOfMonth);
      const targetDate = new Date(year, month, targetDay);
      if (targetDate >= start && targetDate <= end) {
        dates.push(formatDate(targetDate));
      }
      m.setMonth(m.getMonth() + 1);
    }
  }

  return dates;
}

/**
 * 固定費用の小カテゴリを取得or作成（同名なら流用）
 */
async function findOrCreateFixedCostSubcategory(name) {
  const cats = await KakeiboDB.getAllCategories();
  const parent = cats.find(c => c.name === '固定費' && c.parent_id === null);
  if (!parent) throw new Error('固定費カテゴリが見つかりません');

  const existing = cats.find(c => c.name === name && c.parent_id === parent.id);
  if (existing) return existing;

  return await KakeiboDB.addCategory({ name, parent_id: parent.id });
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

async function switchPage(pageId) {
  state.currentPage = pageId;

  document.querySelectorAll('.page').forEach(page => {
    page.classList.remove('active');
  });
  document.getElementById(`page-${pageId}`).classList.add('active');

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === pageId);
  });

  if (pageId === 'home') {
    await renderHome();
  } else if (pageId === 'calendar') {
    await renderCalendar();
  } else if (pageId === 'settings') {
    await renderRecurringList();
  }
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

  const { startDate, endDate, lastDay } = getMonthRange(y, m);
  const transactions = await KakeiboDB.getTransactionsByPeriod(startDate, endDate);

  const dailyTotals = {};
  transactions.forEach(t => {
    dailyTotals[t.date] = (dailyTotals[t.date] || 0) + t.amount;
  });

  const monthTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('month-total-amount').textContent = `¥${monthTotal.toLocaleString()}`;

  const prevTransactions = await getPrevMonthTransactions(y, m);
  const prevTotal = prevTransactions.reduce((sum, t) => sum + t.amount, 0);
  updateMonthDiff('calendar-month-diff', monthTotal, prevTotal);

  const container = document.getElementById('calendar-container');
  container.innerHTML = '';

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
      amountSpan.textContent = `${dailyTotals[dateStr].toLocaleString()}円`;
      amountSpan.style.fontSize = getAmountFontSize(dailyTotals[dateStr]);
      cell.appendChild(amountSpan);
    }

    cell.addEventListener('click', () => openDateModal(dateStr));
    currentRow.appendChild(cell);
  }
}

// ─── ホーム ───

function setupHomeNavigation() {
  document.getElementById('home-prev-month').addEventListener('click', () => {
    state.homeMonth--;
    if (state.homeMonth < 1) {
      state.homeMonth = 12;
      state.homeYear--;
    }
    renderHome();
  });

  document.getElementById('home-next-month').addEventListener('click', () => {
    state.homeMonth++;
    if (state.homeMonth > 12) {
      state.homeMonth = 1;
      state.homeYear++;
    }
    renderHome();
  });

  document.getElementById('home-today-btn').addEventListener('click', () => {
    const now = new Date();
    state.homeYear = now.getFullYear();
    state.homeMonth = now.getMonth() + 1;
    renderHome();
  });
}

function calcParentTotals(transactions, catMap) {
  const totals = {};
  transactions.forEach(t => {
    const cat = catMap[t.category_id];
    if (!cat) return;
    const parentId = cat.parent_id || cat.id;
    totals[parentId] = (totals[parentId] || 0) + t.amount;
  });
  return totals;
}

async function renderHome() {
  const { homeYear: y, homeMonth: m } = state;
  document.getElementById('home-current-month').textContent = `${y}年${m}月`;

  const { startDate, endDate } = getMonthRange(y, m);
  const transactions = await KakeiboDB.getTransactionsByPeriod(startDate, endDate);
  const categories = await KakeiboDB.getAllCategories();
  const prevTransactions = await getPrevMonthTransactions(y, m);

  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c; });

  const monthTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
  const prevTotal = prevTransactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('home-total-amount').textContent = `¥${monthTotal.toLocaleString()}`;
  updateMonthDiff('home-month-diff', monthTotal, prevTotal);

  const emptyEl = document.getElementById('home-empty');
  const canvasEl = document.getElementById('home-chart');
  const listEl = document.getElementById('home-category-list');

  if (transactions.length === 0) {
    emptyEl.style.display = 'block';
    canvasEl.style.display = 'none';
    listEl.innerHTML = '';
    if (state.homeChart) {
      state.homeChart.destroy();
      state.homeChart = null;
    }
    return;
  }

  emptyEl.style.display = 'none';
  canvasEl.style.display = 'block';

  const parentTotals = calcParentTotals(transactions, catMap);
  const prevParentTotals = calcParentTotals(prevTransactions, catMap);

  const sortedEntries = Object.entries(parentTotals).sort((a, b) => b[1] - a[1]);
  const labels = sortedEntries.map(([id]) => catMap[id]?.name || '(不明)');
  const values = sortedEntries.map(([, amt]) => amt);
  const colors = labels.map(name => getCategoryColor(name));

  if (state.homeChart) {
    state.homeChart.destroy();
  }

  const ctx = canvasEl.getContext('2d');
  state.homeChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: { padding: 4 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context) => {
              const label = context.label || '';
              const value = context.parsed;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percent = ((value / total) * 100).toFixed(1);
              return `${label}: ¥${value.toLocaleString()} (${percent}%)`;
            },
          },
        },
      },
    },
    plugins: [{
      id: 'sliceLabels',
      afterDatasetsDraw(chart) {
        const { ctx, data } = chart;
        const meta = chart.getDatasetMeta(0);
        const total = data.datasets[0].data.reduce((a, b) => a + b, 0);

        meta.data.forEach((arc, i) => {
          const value = data.datasets[0].data[i];
          const percent = (value / total) * 100;
          if (percent < 10) return;

          const label = data.labels[i];
          const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
            true
          );
          const midAngle = (startAngle + endAngle) / 2;
          const radius = (outerRadius + innerRadius) / 2;
          const labelX = x + Math.cos(midAngle) * radius;
          const labelY = y + Math.sin(midAngle) * radius;

          ctx.save();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
          ctx.shadowBlur = 3;
          ctx.fillText(label, labelX, labelY - 6);
          ctx.font = 'bold 10px sans-serif';
          ctx.fillText(`${percent.toFixed(0)}%`, labelX, labelY + 6);
          ctx.restore();
        });
      },
    }],
  });

  renderCategoryList(sortedEntries, catMap, monthTotal, prevParentTotals, prevTotal);
}

function renderCategoryList(sortedEntries, catMap, monthTotal, prevParentTotals, prevTotal) {
  const listEl = document.getElementById('home-category-list');
  listEl.innerHTML = '';

  sortedEntries.forEach(([id, amount]) => {
    const cat = catMap[id];
    if (!cat) return;

    const item = document.createElement('div');
    item.className = 'category-list-item';

    const left = document.createElement('div');
    left.className = 'category-list-left';

    const colorMark = document.createElement('div');
    colorMark.className = 'category-color-mark';
    colorMark.style.backgroundColor = getCategoryColor(cat.name);

    const name = document.createElement('div');
    name.className = 'category-name';
    name.textContent = cat.name;

    left.appendChild(colorMark);
    left.appendChild(name);

    const amountWrap = document.createElement('div');
    amountWrap.className = 'category-amount-wrap';

    const amountEl = document.createElement('div');
    amountEl.className = 'category-amount';
    amountEl.textContent = `¥${amount.toLocaleString()}`;

    const prevAmount = prevParentTotals[id] || 0;
    const { text: diffText, cssClass } = formatCategoryDiff(amount, prevAmount);
    const diffEl = document.createElement('div');
    diffEl.className = `category-diff ${cssClass}`;
    diffEl.textContent = diffText;

    amountWrap.appendChild(amountEl);
    amountWrap.appendChild(diffEl);

    item.appendChild(left);
    item.appendChild(amountWrap);
    listEl.appendChild(item);
  });

  // 合計行
  const totalItem = document.createElement('div');
  totalItem.className = 'category-list-item total';

  const totalLeft = document.createElement('div');
  totalLeft.className = 'category-list-left';
  const totalName = document.createElement('div');
  totalName.className = 'category-name';
  totalName.textContent = '合計';
  totalLeft.appendChild(totalName);

  const totalAmountWrap = document.createElement('div');
  totalAmountWrap.className = 'category-amount-wrap';
  const totalAmountEl = document.createElement('div');
  totalAmountEl.className = 'category-amount';
  totalAmountEl.textContent = `¥${monthTotal.toLocaleString()}`;

  const { text: totalDiffText, cssClass: totalDiffClass } = formatCategoryDiff(monthTotal, prevTotal);
  const totalDiffEl = document.createElement('div');
  totalDiffEl.className = `category-diff ${totalDiffClass}`;
  totalDiffEl.textContent = totalDiffText;

  totalAmountWrap.appendChild(totalAmountEl);
  totalAmountWrap.appendChild(totalDiffEl);

  totalItem.appendChild(totalLeft);
  totalItem.appendChild(totalAmountWrap);
  listEl.appendChild(totalItem);
}

// ─── 日付モーダル / 入力フォームモーダル ───

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
        <div class="record-category">${escapeHtml(catMap[t.category_id] || '(不明)')}</div>
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
      const existing = await KakeiboDB.get(KakeiboDB.STORES.transactions, state.editingTransactionId);
      await KakeiboDB.updateTransaction({
        ...existing,
        date,
        category_id,
        amount: parseInt(amount, 10),
        memo,
      });
    } else {
      await KakeiboDB.addTransaction({ date, category_id, amount, memo });
    }

    closeFormModal();
    await renderDateModalBody();
    await renderCalendar();
    await renderHome();
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
    await renderHome();
  } catch (err) {
    console.error('削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

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
  document.getElementById('transaction-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleSave();
  });
}

// ─── 固定費設定モーダル ───

function populateDayOfMonthSelect() {
  const select = document.getElementById('day-of-month-select');
  select.innerHTML = '';
  for (let i = 1; i <= 31; i++) {
    const option = document.createElement('option');
    option.value = i;
    option.textContent = `${i}日`;
    select.appendChild(option);
  }
}

function setupRecurringModal() {
  document.getElementById('add-recurring-btn').addEventListener('click', () => openRecurringModal(null));
  document.getElementById('recurring-back-btn').addEventListener('click', closeRecurringModal);
  document.querySelector('#recurring-modal .modal-overlay').addEventListener('click', closeRecurringModal);
  document.getElementById('recurring-save-btn').addEventListener('click', handleRecurringSave);
  document.getElementById('recurring-delete-btn').addEventListener('click', handleRecurringDelete);

  document.querySelectorAll('.freq-btn').forEach(btn => {
    btn.addEventListener('click', () => switchFrequencyTab(btn.dataset.freq));
  });

  document.getElementById('recurring-form').addEventListener('submit', (e) => {
    e.preventDefault();
    handleRecurringSave();
  });
}

function switchFrequencyTab(freq) {
  state.currentFrequency = freq;
  document.querySelectorAll('.freq-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.freq === freq);
  });

  const dayOfMonthLabel = document.getElementById('day-of-month-label');
  const dayOfWeekLabel = document.getElementById('day-of-week-label');

  if (freq === 'monthly') {
    dayOfMonthLabel.style.display = '';
    dayOfWeekLabel.style.display = 'none';
  } else if (freq === 'weekly') {
    dayOfMonthLabel.style.display = 'none';
    dayOfWeekLabel.style.display = '';
  } else {
    // daily or weekday: どちらも日/曜日選択なし
    dayOfMonthLabel.style.display = 'none';
    dayOfWeekLabel.style.display = 'none';
  }
}

async function openRecurringModal(template = null) {
  state.editingRecurringId = template ? template.id : null;

  document.getElementById('recurring-title').textContent = template ? '固定費を編集' : '固定費を追加';
  document.getElementById('recurring-delete-btn').style.display = template ? 'block' : 'none';

  if (template) {
    // 編集モード
    switchFrequencyTab(template.frequency);
    if (template.day_of_month !== null && template.day_of_month !== undefined) {
      document.getElementById('day-of-month-select').value = template.day_of_month;
    }
    if (template.day_of_week !== null && template.day_of_week !== undefined) {
      document.getElementById('day-of-week-select').value = template.day_of_week;
    }
    // カテゴリ名を取得
    const cats = await KakeiboDB.getAllCategories();
    const cat = cats.find(c => c.id === template.category_id);
    document.getElementById('recurring-name-input').value = cat ? cat.name : '';
    document.getElementById('recurring-amount-input').value = template.amount;
    document.getElementById('recurring-memo-input').value = template.memo || '';
  } else {
    // 新規モード
    switchFrequencyTab('monthly');
    document.getElementById('day-of-month-select').value = 1;
    document.getElementById('day-of-week-select').value = 1;
    document.getElementById('recurring-name-input').value = '';
    document.getElementById('recurring-amount-input').value = '';
    document.getElementById('recurring-memo-input').value = '';
  }

  document.getElementById('recurring-modal').classList.add('active');
}

function closeRecurringModal() {
  document.getElementById('recurring-modal').classList.remove('active');
  state.editingRecurringId = null;
}

async function handleRecurringSave() {
  const name = document.getElementById('recurring-name-input').value.trim();
  const amount = document.getElementById('recurring-amount-input').value;
  const memo = document.getElementById('recurring-memo-input').value.trim();
  const frequency = state.currentFrequency;

  if (!name || !amount) {
    alert('名前と金額は必須です');
    return;
  }

  let day_of_month = null;
  let day_of_week = null;
  if (frequency === 'monthly') {
    day_of_month = parseInt(document.getElementById('day-of-month-select').value, 10);
  } else if (frequency === 'weekly') {
    day_of_week = parseInt(document.getElementById('day-of-week-select').value, 10);
  }

  try {
    // 小カテゴリを取得or作成
    const subcategory = await findOrCreateFixedCostSubcategory(name);

    if (state.editingRecurringId) {
      // 編集
      const existing = await KakeiboDB.get(KakeiboDB.STORES.recurring, state.editingRecurringId);
      await KakeiboDB.updateRecurring({
        ...existing,
        frequency,
        day_of_month,
        day_of_week,
        category_id: subcategory.id,
        amount: parseInt(amount, 10),
        memo,
      });
    } else {
      // 新規登録: 開始日は今日、last_generated_dateはnull（次回起動時から生成される）
      await KakeiboDB.addRecurring({
        frequency,
        day_of_month,
        day_of_week,
        category_id: subcategory.id,
        amount,
        memo,
        start_date: getTodayString(),
      });
    }

    closeRecurringModal();
    // 生成を試す（今日が該当日だった場合を考慮）
    const generatedCount = await generateRecurringTransactions();
    if (generatedCount > 0) {
      console.log(`固定費を追加後、${generatedCount} 件を自動生成`);
    }
    await populateCategorySelect();
    await renderRecurringList();
    await renderCalendar();
    await renderHome();
  } catch (err) {
    console.error('固定費保存エラー:', err);
    alert('保存に失敗しました: ' + err.message);
  }
}

async function handleRecurringDelete() {
  if (!state.editingRecurringId) return;
  if (!confirm('この固定費テンプレートを削除しますか？\n(既に自動追加された過去の記録は残ります)')) return;

  try {
    await KakeiboDB.deleteRecurring(state.editingRecurringId);
    closeRecurringModal();
    await renderRecurringList();
  } catch (err) {
    console.error('固定費削除エラー:', err);
    alert('削除に失敗しました: ' + err.message);
  }
}

async function renderRecurringList() {
  const listEl = document.getElementById('recurring-list');
  const templates = await KakeiboDB.getAllRecurring();
  const categories = await KakeiboDB.getAllCategories();
  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c; });

  listEl.innerHTML = '';

  if (templates.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'recurring-empty';
    empty.textContent = 'まだ固定費が登録されていません';
    listEl.appendChild(empty);
    return;
  }

  // 周期でソート: monthly → weekly → daily の順、その後名前で
  const order = { monthly: 0, weekly: 1, weekday: 2, daily: 3 };
  templates.sort((a, b) => {
    const oDiff = order[a.frequency] - order[b.frequency];
    if (oDiff !== 0) return oDiff;
    const nameA = catMap[a.category_id]?.name || '';
    const nameB = catMap[b.category_id]?.name || '';
    return nameA.localeCompare(nameB);
  });

  templates.forEach(t => {
    const cat = catMap[t.category_id];
    const name = cat ? cat.name : '(削除済み)';

    const item = document.createElement('div');
    item.className = 'recurring-item';
    item.innerHTML = `
      <div class="recurring-info">
        <div class="recurring-name">${escapeHtml(name)}</div>
        <div class="recurring-schedule">${escapeHtml(formatFrequencyText(t))}</div>
      </div>
      <div class="recurring-amount">¥${t.amount.toLocaleString()}</div>
    `;
    item.addEventListener('click', () => openRecurringModal(t));
    listEl.appendChild(item);
  });
}

function formatFrequencyText(template) {
  if (template.frequency === 'daily') {
    return '毎日';
  } else if (template.frequency === 'weekday') {
    return '平日（祝日除く）';
  } else if (template.frequency === 'weekly') {
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    return `毎週${weekdays[template.day_of_week]}曜日`;
  } else if (template.frequency === 'monthly') {
    return `毎月${template.day_of_month}日`;
  }
  return '';
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}