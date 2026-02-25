/**
 * Timezone-aware date utilities.
 *
 * All "day boundary" logic uses the IANA timezone the client sends
 * so that "today" always means the user's local calendar date,
 * regardless of where the server is running.
 */

/**
 * Return the UTC epoch-ms for midnight (start) of `dateStr` in `timeZone`.
 *
 * Example:
 *   startOfDayUtcMs('2026-02-10', 'America/New_York')
 *   → UTC ms for 2026-02-10T00:00:00 Eastern
 *   (which is 2026-02-10T05:00:00Z during EST)
 */
export function startOfDayUtcMs(dateStr: string, timeZone: string): number {
  // 1. Take midnight UTC of the requested date as a reference point.
  const midnightUtc = new Date(`${dateStr}T00:00:00.000Z`);

  // 2. Format that moment in the target timezone to learn the offset.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(midnightUtc);
  const get = (type: string) =>
    parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);

  let hour = get('hour');
  if (hour === 24) hour = 0; // some locales render midnight as 24

  // 3. Reconstruct the local representation as if it were UTC,
  //    then compute offset = localAsUtc − midnightUtc.
  const localAsUtcMs = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    hour,
    get('minute'),
    get('second'),
  );
  const offsetMs = localAsUtcMs - midnightUtc.getTime();

  // 4. midnight_local_in_utc = midnightUtc − offset
  return midnightUtc.getTime() - offsetMs;
}

/**
 * Add `days` to a YYYY-MM-DD string and return a new YYYY-MM-DD string.
 * Uses UTC arithmetic so server-local timezone never affects the result.
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

/**
 * Convert a UTC epoch-ms value to the local YYYY-MM-DD date in `timeZone`.
 */
export function utcMsToLocalDate(utcMs: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(utcMs));
}

/**
 * Validate that a string is a recognised IANA timezone identifier.
 */
export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
