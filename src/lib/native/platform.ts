import { Capacitor } from '@capacitor/core';

// False on the web and during SSR; true only inside the Capacitor iOS/Android shell.
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}

/** 'ios' | 'android' inne i skallet, 'web' ellers — til user_metadata.plattform ved registrering. */
export function plattform(): 'ios' | 'android' | 'web' {
  const p = Capacitor.getPlatform();
  return p === 'ios' || p === 'android' ? p : 'web';
}
