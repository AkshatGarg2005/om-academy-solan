export function formatDate(timestamp) {
  if (!timestamp) return '—';
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatMonth(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function getPercentage(obtained, total) {
  if (!total || total === 0) return 0;
  return Math.round((obtained / total) * 100);
}

export function getAttendancePercentage(presentCount, totalCount) {
  if (!totalCount || totalCount === 0) return 0;
  return Math.round((presentCount / totalCount) * 100);
}

export function getCurrentMonthYear() {
  const now = new Date();
  return now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

export function getInitials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

// Today as YYYY-MM-DD in the *local* timezone, for <input type="date"> defaults.
//
// new Date().toISOString().split('T')[0] is UTC, so in IST (UTC+5:30) it returns
// yesterday's date between 00:00 and 05:29 local. Call this per render rather
// than caching it in a module constant, which would go stale past midnight.
export function todayLocalISO() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}
