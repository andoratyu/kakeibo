// app.js — メインロジック

// 状態管理
const state = {
  currentPage: 'calendar',
  currentYear: new Date().getFullYear(),
  currentMonth: new Date().getMonth() + 1,
  homeYear: new Date().getFullYear(),
  homeMonth: new Date().getMonth() + 1,
  selectedDate: null,
  editingTransactionId: null,
  homeChart: null,
};

// ─── 初期化 ───
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await KakeiboDB.initDefaultCategories();
    await populateCategorySelect();
    setupTabNavigation();
    setupCalendarNavigation();
    setupHomeNavigation();
    setupModals();
    setupForm();
    await renderCalendar();
    await renderHome();
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

function getMonthRange(year, month) {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { startDate, endDate, lastDay };
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
  }
}

// ─── カレンダー画面 ───

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
      // 「5,000円」形式（円を後ろに、¥は使わない）
      amountSpan.textContent = `${dailyTotals[dateStr].toLocaleString()}円`;
      cell.appendChild(amountSpan);
    }

    cell.addEventListener('click', () => openDateModal(dateStr));
    currentRow.appendChild(cell);
  }
}

// ─── ホーム画面 ───

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

async function renderHome() {
  const { homeYear: y, homeMonth: m } = state;

  document.getElementById('home-current-month').textContent = `${y}年${m}月`;

  const { startDate, endDate } = getMonthRange(y, m);
  const transactions = await KakeiboDB.getTransactionsByPeriod(startDate, endDate);
  const categories = await KakeiboDB.getAllCategories();

  const monthTotal = transactions.reduce((sum, t) => sum + t.amount, 0);
  document.getElementById('home-total-amount').textContent = `¥${monthTotal.toLocaleString()}`;

  const emptyEl = document.getElementById('home-empty');
  const canvasEl = document.getElementById('home-chart');

  if (transactions.length === 0) {
    emptyEl.style.display = 'block';
    canvasEl.style.display = 'none';
    if (state.homeChart) {
      state.homeChart.destroy();
      state.homeChart = null;
    }
    return;
  }

  emptyEl.style.display = 'none';
  canvasEl.style.display = 'block';

  const catMap = {};
  categories.forEach(c => { catMap[c.id] = c; });

  const parentTotals = {};
  transactions.forEach(t => {
    const cat = catMap[t.category_id];
    if (!cat) return;
    const parentId = cat.parent_id || cat.id;
    parentTotals[parentId] = (parentTotals[parentId] || 0) + t.amount;
  });

  const sortedEntries = Object.entries(parentTotals).sort((a, b) => b[1] - a[1]);

  const labels = sortedEntries.map(([id]) => catMap[id]?.name || '(不明)');
  const values = sortedEntries.map(([, amt]) => amt);

  const colors = generateGrayscaleColors(labels.length);

  if (state.homeChart) {
    state.homeChart.destroy();
  }

  // 画面幅に応じて padding を調整
  const isMobile = window.innerWidth < 600;
  const horizontalPadding = isMobile ? 60 : 100;
  const verticalPadding = isMobile ? 20 : 30;

  const ctx = canvasEl.getContext('2d');
  state.homeChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: colors,
        borderColor: '#ffffff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      layout: {
        padding: {
          top: verticalPadding,
          right: horizontalPadding,
          bottom: verticalPadding,
          left: horizontalPadding,
        },
      },
      plugins: {
        legend: {
          display: false,
        },
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

        // 大きい扇: 扇内にラベル
        meta.data.forEach((arc, i) => {
          const value = data.datasets[0].data[i];
          const percent = (value / total) * 100;
          const label = data.labels[i];

          const { x, y, startAngle, endAngle, outerRadius, innerRadius } = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'outerRadius', 'innerRadius'],
            true
          );

          if (percent < 8) return;

          const midAngle = (startAngle + endAngle) / 2;
          const radius = (outerRadius + innerRadius) / 2;
          const labelX = x + Math.cos(midAngle) * radius;
          const labelY = y + Math.sin(midAngle) * radius;

          const bgColor = data.datasets[0].backgroundColor[i];
          const textColor = getContrastColor(bgColor);

          ctx.save();
          ctx.fillStyle = textColor;
          ctx.font = isMobile ? 'bold 12px sans-serif' : 'bold 14px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`${label} ${percent.toFixed(0)}%`, labelX, labelY);
          ctx.restore();
        });

        // 小さい扇: 引き出し線で外に
        const canvas = chart.canvas;
        const canvasWidth = canvas.width / (window.devicePixelRatio || 1);
        const labelWidth = isMobile ? 55 : 70;
        const edgeMargin = 4;

        const smallLabels = [];
        meta.data.forEach((arc, i) => {
          const value = data.datasets[0].data[i];
          const percent = (value / total) * 100;
          if (percent >= 8) return;

          const { x, y, startAngle, endAngle, outerRadius } = arc.getProps(
            ['x', 'y', 'startAngle', 'endAngle', 'outerRadius'],
            true
          );
          const midAngle = (startAngle + endAngle) / 2;
          const startX = x + Math.cos(midAngle) * outerRadius;
          const startY = y + Math.sin(midAngle) * outerRadius;
          const isRight = Math.cos(midAngle) >= 0;

          const bendX = x + Math.cos(midAngle) * (outerRadius + 10);
          const bendY = y + Math.sin(midAngle) * (outerRadius + 10);

          const endX = isRight
            ? canvasWidth - edgeMargin - labelWidth
            : edgeMargin + labelWidth;
          const endY = bendY;

          smallLabels.push({
            label: data.labels[i],
            percent,
            startX, startY,
            bendX, bendY,
            endX, endY,
            isRight,
          });
        });

        const rightLabels = smallLabels.filter(l => l.isRight).sort((a, b) => a.endY - b.endY);
        const leftLabels = smallLabels.filter(l => !l.isRight).sort((a, b) => a.endY - b.endY);

        adjustLabelYPositions(rightLabels, 18);
        adjustLabelYPositions(leftLabels, 18);

        [...rightLabels, ...leftLabels].forEach(l => {
          ctx.save();
          ctx.strokeStyle = '#666666';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(l.startX, l.startY);
          ctx.lineTo(l.bendX, l.bendY);
          ctx.lineTo(l.endX, l.endY);
          ctx.stroke();

          ctx.fillStyle = '#333333';
          ctx.font = isMobile ? '10px sans-serif' : '12px sans-serif';
          ctx.textAlign = l.isRight ? 'left' : 'right';
          ctx.textBaseline = 'middle';
          const textOffsetX = l.isRight ? 4 : -4;
          ctx.fillText(`${l.label} ${l.percent.toFixed(0)}%`, l.endX + textOffsetX, l.endY);
          ctx.restore();
        });
      },
    }],
  });
}

function adjustLabelYPositions(labels, minSpacing) {
  for (let i = 1; i < labels.length; i++) {
    const prev = labels[i - 1];
    const curr = labels[i];
    if (curr.endY - prev.endY < minSpacing) {
      curr.endY = prev.endY + minSpacing;
    }
  }
}

function generateGrayscaleColors(n) {
  const colors = [];
  const min = 60;
  const max = 200;
  for (let i = 0; i < n; i++) {
    const value = n === 1 ? 130 : Math.round(min + (max - min) * (i / (n - 1)));
    colors.push(`rgb(${value}, ${value}, ${value})`);
  }
  return colors;
}

function getContrastColor(rgbStr) {
  const match = rgbStr.match(/\d+/g);
  if (!match) return '#000000';
  const [r, g, b] = match.map(Number);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? '#000000' : '#ffffff';
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