import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import isoWeek from 'dayjs/plugin/isoWeek';
import customParse from 'dayjs/plugin/customParseFormat';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(isoWeek);
dayjs.extend(customParse);

export { dayjs };

export function monthKey(date = dayjs()) {
  return dayjs(date).format('YYYY-MM');
}

export function weekKey(date = dayjs()) {
  return dayjs(date).format('YYYY-[W]WW');
}

export function isInMonth(date, monthDate = dayjs()) {
  if (!date) return false;
  return dayjs(date).format('YYYY-MM') === dayjs(monthDate).format('YYYY-MM');
}

export function isInDay(date, dayDate = dayjs()) {
  if (!date) return false;
  return dayjs(date).format('YYYY-MM-DD') === dayjs(dayDate).format('YYYY-MM-DD');
}

export function isInWeek(date, weekDate = dayjs()) {
  if (!date) return false;
  const d = dayjs(date);
  const ref = dayjs(weekDate);
  return d.isoWeekYear() === ref.isoWeekYear() && d.isoWeek() === ref.isoWeek();
}

export function quarterOf(date = dayjs()) {
  const d = dayjs(date);
  return `${d.year()}-Q${Math.floor(d.month() / 3) + 1}`;
}

export function startOfMonth(date = dayjs()) {
  return dayjs(date).startOf('month');
}

export const DEFAULT_TIMEZONES = [
  { label: 'India',     tz: 'Asia/Kolkata',     code: 'IST' },
  { label: 'Australia', tz: 'Australia/Sydney', code: 'AEST' },
  { label: 'UK',        tz: 'Europe/London',    code: 'BST' },
  { label: 'USA (NY)',  tz: 'America/New_York', code: 'EST' },
  { label: 'Canada',    tz: 'America/Toronto',  code: 'EST' },
  { label: 'Singapore', tz: 'Asia/Singapore',   code: 'SGT' },
  { label: 'Dubai',     tz: 'Asia/Dubai',       code: 'GST' },
];

export const ALL_TIMEZONES = [
  { label: 'India',         tz: 'Asia/Kolkata',        code: 'IST' },
  { label: 'Pakistan',      tz: 'Asia/Karachi',        code: 'PKT' },
  { label: 'Bangladesh',    tz: 'Asia/Dhaka',          code: 'BST' },
  { label: 'Sri Lanka',     tz: 'Asia/Colombo',        code: 'IST' },
  { label: 'Singapore',     tz: 'Asia/Singapore',      code: 'SGT' },
  { label: 'Malaysia',      tz: 'Asia/Kuala_Lumpur',   code: 'MYT' },
  { label: 'Indonesia',     tz: 'Asia/Jakarta',        code: 'WIB' },
  { label: 'Philippines',   tz: 'Asia/Manila',         code: 'PHT' },
  { label: 'Japan',         tz: 'Asia/Tokyo',          code: 'JST' },
  { label: 'China',         tz: 'Asia/Shanghai',       code: 'CST' },
  { label: 'Hong Kong',     tz: 'Asia/Hong_Kong',      code: 'HKT' },
  { label: 'Sydney',        tz: 'Australia/Sydney',    code: 'AEST' },
  { label: 'Melbourne',     tz: 'Australia/Melbourne', code: 'AEST' },
  { label: 'Brisbane',      tz: 'Australia/Brisbane',  code: 'AEST' },
  { label: 'Adelaide',      tz: 'Australia/Adelaide',  code: 'ACST' },
  { label: 'Canberra',      tz: 'Australia/ACT',       code: 'AEST' },
  { label: 'Perth',         tz: 'Australia/Perth',     code: 'AWST' },
  { label: 'New Zealand',   tz: 'Pacific/Auckland',    code: 'NZST' },
  { label: 'Dubai/UAE',     tz: 'Asia/Dubai',          code: 'GST' },
  { label: 'Saudi Arabia',  tz: 'Asia/Riyadh',         code: 'AST' },
  { label: 'Qatar',         tz: 'Asia/Qatar',          code: 'AST' },
  { label: 'Oman',          tz: 'Asia/Muscat',         code: 'GST' },
  { label: 'UK',            tz: 'Europe/London',       code: 'GMT' },
  { label: 'Germany',       tz: 'Europe/Berlin',       code: 'CET' },
  { label: 'France',        tz: 'Europe/Paris',        code: 'CET' },
  { label: 'Spain',         tz: 'Europe/Madrid',       code: 'CET' },
  { label: 'USA (NY)',      tz: 'America/New_York',    code: 'EST' },
  { label: 'USA (Chi)',     tz: 'America/Chicago',     code: 'CST' },
  { label: 'USA (LA)',      tz: 'America/Los_Angeles', code: 'PST' },
  { label: 'Canada (Tor)',  tz: 'America/Toronto',     code: 'EST' },
  { label: 'Canada (Van)',  tz: 'America/Vancouver',   code: 'PST' },
  { label: 'South Africa',  tz: 'Africa/Johannesburg', code: 'SAST' },
];
