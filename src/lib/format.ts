import type { BusinessHours, Locale } from '@/lib/types';

/**
 * Swap an em/en dash used as a parenthetical break for a comma. The café owner does not
 * want dashes in the display copy; the compiled dictionary and the seed migrations are
 * clean, but a row already saved in `site_content` may still hold one, so headline copy
 * is passed through this on the way out rather than trusting the stored value.
 */
export function stripDash(text: string): string {
  return text.replace(/\s*[—–]{1,2}\s*/g, ', ');
}

/** Prices always render with Latin digits so QAR figures read the same in both
 *  locales — a café price list is not the place for numeral-system surprises. */
export function money(amount: number, currency = 'QAR'): string {
  return `${currency} ${amount.toFixed(2)}`;
}

export function moneyShort(amount: number): string {
  return Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
}

const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export function dayName(day: number, locale: Locale): string {
  return (locale === 'ar' ? DAYS_AR : DAYS_EN)[day] ?? '';
}

/** "12:00" -> "12 PM", "00:00" -> "12 AM". Hours come from the database, so this
 *  must not assume the café's current 12:00–00:00 pattern. */
export function clock(time: string | null): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${hour12}:${String(m).padStart(2, '0')} ${suffix}` : `${hour12} ${suffix}`;
}

/**
 * Whether the café is open right now, honouring windows that cross midnight
 * (12:00–00:00 counts as open at 23:30 on the same day).
 * Evaluated in Qatar time regardless of the visitor's device timezone.
 */
export function isOpenNow(hours: BusinessHours[], now = new Date()): boolean {
  const qatar = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Qatar' }));
  const minutesNow = qatar.getHours() * 60 + qatar.getMinutes();
  const today = hours.find((h) => h.day_of_week === qatar.getDay());
  const yesterday = hours.find((h) => h.day_of_week === (qatar.getDay() + 6) % 7);

  const toMinutes = (t: string | null) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  if (today && !today.is_closed) {
    const open = toMinutes(today.opens_at);
    const close = toMinutes(today.closes_at);
    if (open !== null && close !== null) {
      if (close > open && minutesNow >= open && minutesNow < close) return true;
      // window runs past midnight: open until close *tomorrow*
      if (close <= open && minutesNow >= open) return true;
    }
  }

  // still inside yesterday's post-midnight tail?
  if (yesterday && !yesterday.is_closed) {
    const open = toMinutes(yesterday.opens_at);
    const close = toMinutes(yesterday.closes_at);
    if (open !== null && close !== null && close <= open && minutesNow < close) return true;
  }

  return false;
}
