/**
 * Currency readouts must repaint when the profile changes.
 *
 * The bug this guards: every screen read `state.profile` once at mount, and the
 * ~20 places that replace the profile told nobody. Buying gold in the shop left
 * the collection screen showing its mount-time balance until you navigated away
 * and back. The fix is that the assignment itself announces the change, so the
 * contract worth testing is "every currency on screen carries data-cur, and
 * setProfile notifies".
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const uiSrc = readFileSync(fileURLToPath(new URL('../../ui.ts', import.meta.url)), 'utf8');
const mainSrc = readFileSync(fileURLToPath(new URL('../../main.ts', import.meta.url)), 'utf8');
const onboardSrc = readFileSync(fileURLToPath(new URL('../../onboarding.ts', import.meta.url)), 'utf8');

describe('setProfile is the only way in', () => {
  it.each([['ui.ts', uiSrc], ['main.ts', mainSrc], ['onboarding.ts', onboardSrc]])(
    '%s never assigns state.profile directly', (_f, src) => {
      // A direct assignment silently skips every listener — the exact shape of
      // the original bug.
      expect(src).not.toMatch(/state\.profile\s*=/);
    });

  it('ui.ts installs the sync and main.ts calls it', () => {
    expect(uiSrc).toMatch(/export function installProfileSync/);
    expect(uiSrc).toMatch(/onProfile\(/);
    expect(mainSrc).toMatch(/installProfileSync\(\)/);
  });
});

describe('rendered currencies are addressable', () => {
  it('no screen prints a raw currency emoji', () => {
    // 🪙/💎 are unreachable by refreshCurrencies, so they can only ever go stale.
    for (const [name, src] of [['ui.ts', uiSrc], ['onboarding.ts', onboardSrc]] as const) {
      expect(src, `${name} still renders a currency emoji`).not.toMatch(/[🪙💎]/u);
    }
  });
});
