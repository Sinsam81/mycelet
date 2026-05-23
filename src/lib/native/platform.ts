import { Capacitor } from '@capacitor/core';

// False on the web and during SSR; true only inside the Capacitor iOS/Android shell.
export function isNativePlatform(): boolean {
  return Capacitor.isNativePlatform();
}
