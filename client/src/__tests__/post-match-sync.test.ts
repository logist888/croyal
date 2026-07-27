/**
 * The profile must be re-fetched when a match ends.
 *
 * A match is the one thing that changes the profile with no reply to read: the
 * server awards trophies, gold, xp and a CHEST INTO A HUB SLOT, and tells the
 * client only the match result. `renderMenu` renders from `state.profile` once,
 * so without a re-fetch the hub kept showing the pre-match profile — the new
 * chest appeared only after a page reload.
 *
 * Two halves to the contract, and both matter:
 *   1. the pull starts when the result arrives, not when the player leaves
 *      (it should run behind the several-second result sequence), and
 *   2. leaving is gated on it, because the hub reads the profile exactly once.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (f: string) =>
  readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');

const battleSrc = read('battle.ts');
const bossSrc = read('boss.ts');
const netSrc = read('net.ts');

/** Body of showResult, from its declaration to the next function. */
function showResult(src: string): string {
  const start = src.indexOf('function showResult(');
  expect(start, 'showResult not found').toBeGreaterThan(-1);
  const next = src.slice(start + 1).search(/\n {2}(?:async )?function /);
  return src.slice(start, next > -1 ? start + 1 + next : undefined);
}

describe.each([['battle.ts', battleSrc], ['boss.ts', bossSrc]])('%s', (_name, src) => {
  const body = showResult(src);

  it('starts the profile pull as soon as the result arrives', () => {
    // Inside showResult, not in the exit handler — the request should overlap
    // the result sequence rather than making the player wait after tapping.
    expect(body).toMatch(/syncProfile\(\)/);
  });

  it('waits for it before leaving the result screen', () => {
    // The hub reads state.profile once. Leaving early races the response and
    // reintroduces the stale hub this fixes.
    expect(body).toMatch(/await synced/);
  });

  it('disables the exit button while waiting so it cannot be double-fired', () => {
    expect(body).toMatch(/ok\.disabled = true/);
  });
});

describe('syncProfile', () => {
  it('publishes through setProfile so every listener repaints', () => {
    expect(netSrc).toMatch(/export async function syncProfile[\s\S]*?setProfile\(/);
  });

  it('never rejects — a flaky network must not strand the result screen', () => {
    const start = netSrc.indexOf('export async function syncProfile');
    const body = netSrc.slice(start, netSrc.indexOf('export const api'));
    expect(body).toMatch(/catch\s*\{/);
  });
});
