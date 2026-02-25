import { describe, it, expect } from 'vitest';
import { startOfDayUtcMs, addDays, utcMsToLocalDate, isValidTimezone } from './timezone';

describe('timezone utilities', () => {
  describe('startOfDayUtcMs', () => {
    it('should return UTC midnight when timezone is UTC', () => {
      const result = startOfDayUtcMs('2026-02-10', 'UTC');
      expect(result).toBe(new Date('2026-02-10T00:00:00.000Z').getTime());
    });

    it('should shift east for America/New_York (UTC-5 in winter)', () => {
      // Midnight EST = 05:00 UTC
      const result = startOfDayUtcMs('2026-02-10', 'America/New_York');
      expect(result).toBe(new Date('2026-02-10T05:00:00.000Z').getTime());
    });

    it('should shift west for Asia/Tokyo (UTC+9)', () => {
      // Midnight JST = 15:00 UTC the previous day
      const result = startOfDayUtcMs('2026-02-10', 'Asia/Tokyo');
      expect(result).toBe(new Date('2026-02-09T15:00:00.000Z').getTime());
    });

    it('should handle America/Los_Angeles (UTC-8 in winter)', () => {
      // Midnight PST = 08:00 UTC
      const result = startOfDayUtcMs('2026-02-10', 'America/Los_Angeles');
      expect(result).toBe(new Date('2026-02-10T08:00:00.000Z').getTime());
    });

    it('should handle half-hour offset timezones (Asia/Kolkata UTC+5:30)', () => {
      // Midnight IST = 18:30 UTC the previous day
      const result = startOfDayUtcMs('2026-02-10', 'Asia/Kolkata');
      expect(result).toBe(new Date('2026-02-09T18:30:00.000Z').getTime());
    });
  });

  describe('addDays', () => {
    it('should add one day', () => {
      expect(addDays('2026-02-10', 1)).toBe('2026-02-11');
    });

    it('should handle month rollover', () => {
      expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    });

    it('should handle year rollover', () => {
      expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    });

    it('should subtract days with negative value', () => {
      expect(addDays('2026-02-10', -1)).toBe('2026-02-09');
    });
  });

  describe('utcMsToLocalDate', () => {
    it('should return UTC date when timezone is UTC', () => {
      const ms = new Date('2026-02-10T23:00:00.000Z').getTime();
      expect(utcMsToLocalDate(ms, 'UTC')).toBe('2026-02-10');
    });

    it('should return next day for east timezone after UTC midnight', () => {
      // 2026-02-10 23:00 UTC = 2026-02-11 08:00 JST
      const ms = new Date('2026-02-10T23:00:00.000Z').getTime();
      expect(utcMsToLocalDate(ms, 'Asia/Tokyo')).toBe('2026-02-11');
    });

    it('should return previous day for west timezone before UTC midnight', () => {
      // 2026-02-11 03:00 UTC = 2026-02-10 22:00 EST
      const ms = new Date('2026-02-11T03:00:00.000Z').getTime();
      expect(utcMsToLocalDate(ms, 'America/New_York')).toBe('2026-02-10');
    });
  });

  describe('isValidTimezone', () => {
    it('should accept valid IANA timezone identifiers', () => {
      expect(isValidTimezone('America/New_York')).toBe(true);
      expect(isValidTimezone('Asia/Tokyo')).toBe(true);
      expect(isValidTimezone('UTC')).toBe(true);
      expect(isValidTimezone('Europe/London')).toBe(true);
    });

    it('should reject invalid timezone strings', () => {
      expect(isValidTimezone('Not/A/Timezone')).toBe(false);
      expect(isValidTimezone('foo')).toBe(false);
      expect(isValidTimezone('')).toBe(false);
    });
  });
});
