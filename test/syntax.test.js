import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// The browser-only files (main.js, art.js, sound.js...) are never imported by the other tests,
// so at least make sure every one of them parses.
test('every source file parses', () => {
  for (const dir of ['src', 'scripts']) {
    for (const f of readdirSync(dir).filter((n) => /\.(m?js)$/.test(n))) {
      assert.doesNotThrow(() => execFileSync(process.execPath, ['--check', `${dir}/${f}`], { stdio: 'pipe' }), `${dir}/${f} has a syntax error`);
    }
  }
});
