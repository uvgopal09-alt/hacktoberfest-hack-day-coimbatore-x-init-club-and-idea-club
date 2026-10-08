import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { loadCampusInfo } from '../src/campusInfo.js';
import { createLocalAnswerer, FALLBACK_ANSWER } from '../src/localAnswers.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Checks the shipped sample file, so the demo buttons always lead to a real answer.
test('the sample campus info has four suggestions and each one gets a real answer', async () => {
  const info = await loadCampusInfo(path.join(projectDir, 'data/campus-info.md'));
  const answer = createLocalAnswerer(info);

  assert.equal(info.suggestions.length, 4);
  for (const suggestion of info.suggestions) {
    assert.notEqual(answer(suggestion), FALLBACK_ANSWER, `no answer for: ${suggestion}`);
  }
});
