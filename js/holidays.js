// holidays.js — 日本の祝日判定（振替休日・国民の休日対応）

const FIXED_HOLIDAYS = {
  '01-01': '元日',
  '02-11': '建国記念の日',
  '02-23': '天皇誕生日',
  '04-29': '昭和の日',
  '05-03': '憲法記念日',
  '05-04': 'みどりの日',
  '05-05': 'こどもの日',
  '08-11': '山の日',
  '11-03': '文化の日',
  '11-23': '勤労感謝の日',
};

const HAPPY_MONDAYS = [
  { month: 1, week: 2, name: '成人の日' },
  { month: 7, week: 3, name: '海の日' },
  { month: 9, week: 3, name: '敬老の日' },
  { month: 10, week: 2, name: 'スポーツの日' },
];

function getVernalEquinox(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getAutumnalEquinox(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function getNthMonday(year, month, week) {
  const firstDay = new Date(year, month - 1, 1);
  const firstMondayDate = 1 + (8 - firstDay.getDay()) % 7;
  return firstMondayDate + (week - 1) * 7;
}

/**
 * 通常の祝日名を取得（振替休日・国民の休日を除く）
 */
function getRegularHolidayName(d) {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  if (FIXED_HOLIDAYS[key]) {
    return FIXED_HOLIDAYS[key];
  }

  for (const hm of HAPPY_MONDAYS) {
    if (hm.month === month && day === getNthMonday(year, hm.month, hm.week)) {
      return hm.name;
    }
  }

  if (month === 3 && day === getVernalEquinox(year)) {
    return '春分の日';
  }

  if (month === 9 && day === getAutumnalEquinox(year)) {
    return '秋分の日';
  }

  return null;
}

/**
 * 振替休日か判定
 * 祝日が日曜と重なった場合、翌日以降の最初の平日が振替休日
 */
function getSubstituteHolidayName(d) {
  const dayOfWeek = d.getDay();
  // 日曜自身、またはその日が既に通常祝日なら振替不要
  if (dayOfWeek === 0) return null;
  if (getRegularHolidayName(d) !== null) return null;

  // 前の日から遡って、日曜の祝日を探す
  const checkDate = new Date(d);
  for (let i = 1; i <= 7; i++) {
    checkDate.setDate(d.getDate() - i);
    const cwd = checkDate.getDay();

    // 日曜 かつ 祝日 なら振替対象
    if (cwd === 0 && getRegularHolidayName(checkDate) !== null) {
      // 間の日が全て祝日でなければ振替休日
      // （最初の非祝日平日が振替になるルール）
      let allSubstituteCandidates = true;
      for (let j = 1; j < i; j++) {
        const between = new Date(checkDate);
        between.setDate(checkDate.getDate() + j);
        if (getRegularHolidayName(between) === null && between.getDay() !== 0) {
          allSubstituteCandidates = false;
          break;
        }
      }
      if (allSubstituteCandidates) {
        return '振替休日';
      }
    }
    // 日曜でない場合は探索終了（隣接する祝日連鎖を追わない）
    if (cwd !== 0 && getRegularHolidayName(checkDate) === null) {
      break;
    }
  }
  return null;
}

/**
 * 国民の休日か判定
 * 祝日と祝日に挟まれた平日（日曜以外）は国民の休日
 */
function getNationalHolidayName(d) {
  const dayOfWeek = d.getDay();
  if (dayOfWeek === 0) return null; // 日曜は対象外
  if (getRegularHolidayName(d) !== null) return null; // 既に祝日
  if (getSubstituteHolidayName(d) !== null) return null; // 既に振替休日

  const prev = new Date(d);
  prev.setDate(d.getDate() - 1);
  const next = new Date(d);
  next.setDate(d.getDate() + 1);

  const prevIsHoliday = getRegularHolidayName(prev) !== null || getSubstituteHolidayName(prev) !== null;
  const nextIsHoliday = getRegularHolidayName(next) !== null || getSubstituteHolidayName(next) !== null;

  if (prevIsHoliday && nextIsHoliday) {
    return '国民の休日';
  }

  return null;
}

/**
 * 日付が祝日か判定（通常祝日 + 振替休日 + 国民の休日）
 */
function getHolidayName(date) {
  let d;
  if (typeof date === 'string') {
    const [y, m, day] = date.split('-').map(Number);
    d = new Date(y, m - 1, day);
  } else {
    d = date;
  }

  return getRegularHolidayName(d)
      || getSubstituteHolidayName(d)
      || getNationalHolidayName(d);
}

function isHoliday(date) {
  return getHolidayName(date) !== null;
}

window.KakeiboHolidays = {
  getHolidayName,
  isHoliday,
};

console.log('holidays.js 読み込み完了');