import { describe, expect, it } from 'vitest';
import { posisjonsVisning } from '../posisjon-visning';

const bergen = { lat: 60.39, lng: 5.32 };
const oslo = { lat: 59.91, lng: 10.75 };

describe('posisjonsVisning', () => {
  it('standardområdet er omtrentlig og kan rettes — uansett om en fersk måling finnes', () => {
    expect(posisjonsVisning({ ...oslo, kilde: 'standard' }, null)).toEqual({ omtrentlig: true, kanRettes: true });
    expect(posisjonsVisning({ ...oslo, kilde: 'standard' }, oslo)).toEqual({ omtrentlig: true, kanRettes: true });
  });

  it('husket posisjon uten fersk måling (Safari, trukket tilgang, kald GPS) kan rettes fra kortet', () => {
    // Bergen på mandag, Oslo på lørdag: kortet må ha en vei ut som ikke er kartet.
    expect(posisjonsVisning({ ...bergen, kilde: 'egen' }, null)).toEqual({ omtrentlig: false, kanRettes: true });
  });

  it('en fersk måling i samme rute bekrefter den huskede — da er kortet ferdig', () => {
    expect(posisjonsVisning({ ...bergen, kilde: 'egen' }, { lat: 60.3912, lng: 5.3249 })).toEqual({
      omtrentlig: false,
      kanRettes: false
    });
  });

  it('fersk måling i en annen rute: det som vises er fortsatt gammelt til den nye hentingen er inne', () => {
    expect(posisjonsVisning({ ...bergen, kilde: 'egen' }, oslo)).toEqual({ omtrentlig: false, kanRettes: true });
  });
});
