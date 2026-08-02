import { describe, expect, it } from 'vitest';
import {
  GRACE_PERIOD_DAYS,
  INACTIVE_THRESHOLD_DAYS,
  graceDeadline,
  hasSignedInSince,
  inactiveCutoff,
  selectAwaitingEmail,
  selectDueForDeletion,
  type DeletionWarning
} from '../retention.ts';

const NOW = new Date('2026-08-02T03:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

function warning(overrides: Partial<DeletionWarning> = {}): DeletionWarning {
  return {
    user_id: 'bruker-1',
    warned_at: new Date(NOW.getTime() - 120 * DAY).toISOString(),
    scheduled_deletion_at: new Date(NOW.getTime() - 30 * DAY).toISOString(),
    warning_email_sent: true,
    ...overrides
  };
}

describe('tallene i erklæringen', () => {
  it('er tre år og nitti dager', () => {
    // Personvern.retentionInactiveDesc: «hvis du ikke logger inn på 3 år …
    // sletter kontoen automatisk 90 dager senere».
    expect(INACTIVE_THRESHOLD_DAYS).toBe(365 * 3);
    expect(GRACE_PERIOD_DAYS).toBe(90);
    expect(graceDeadline(NOW).getTime() - NOW.getTime()).toBe(90 * DAY);
    expect(NOW.getTime() - inactiveCutoff(NOW).getTime()).toBe(365 * 3 * DAY);
  });
});

describe('selectDueForDeletion', () => {
  it('sletter en konto der varselet er sendt og fristen har løpt ut', () => {
    expect(selectDueForDeletion([warning()], NOW)).toHaveLength(1);
  });

  it('sletter INGENTING når varselet aldri ble sendt', () => {
    // Selve feilen: uten Resend-nøkkel blir warning_email_sent stående
    // false, og kontoen ble likevel slettet etter 90 dager — uten at
    // brukeren fikk det varselet erklæringen lover.
    const uvarslet = warning({ warning_email_sent: false });
    expect(selectDueForDeletion([uvarslet], NOW)).toEqual([]);
  });

  it('venter til fristen faktisk har løpt ut', () => {
    const ikkeForfalt = warning({
      scheduled_deletion_at: new Date(NOW.getTime() + DAY).toISOString()
    });
    expect(selectDueForDeletion([ikkeForfalt], NOW)).toEqual([]);
  });

  it('plukker bare ut de forfalte når flere venter', () => {
    const rader = [
      warning({ user_id: 'a' }),
      warning({ user_id: 'b', warning_email_sent: false }),
      warning({ user_id: 'c', scheduled_deletion_at: new Date(NOW.getTime() + DAY).toISOString() })
    ];
    expect(selectDueForDeletion(rader, NOW).map((w) => w.user_id)).toEqual(['a']);
  });
});

describe('selectAwaitingEmail', () => {
  it('finner varslene som ennå ikke er sendt, også fra tidligere kjøringer', () => {
    const rader = [warning({ user_id: 'a' }), warning({ user_id: 'b', warning_email_sent: false })];
    expect(selectAwaitingEmail(rader).map((w) => w.user_id)).toEqual(['b']);
  });
});

describe('hasSignedInSince', () => {
  it('stopper klokka når brukeren har vært innom etter varselet', () => {
    const w = warning();
    expect(hasSignedInSince(new Date(NOW.getTime() - DAY).toISOString(), w.warned_at)).toBe(true);
  });

  it('lar klokka gå når siste innlogging er eldre enn varselet', () => {
    const w = warning();
    expect(hasSignedInSince(new Date(NOW.getTime() - 400 * DAY).toISOString(), w.warned_at)).toBe(
      false
    );
  });

  it('tåler en konto som aldri har logget inn', () => {
    expect(hasSignedInSince(null, warning().warned_at)).toBe(false);
    expect(hasSignedInSince(undefined, warning().warned_at)).toBe(false);
  });
});
