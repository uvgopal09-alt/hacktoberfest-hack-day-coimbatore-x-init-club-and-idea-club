import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { after, before, describe, test } from 'node:test';
import { createAnswerService } from '../src/answerService.js';
import { createApp } from '../src/app.js';
import { parseCampusInfo } from '../src/campusInfo.js';
import { FALLBACK_ANSWER } from '../src/localAnswers.js';

const projectDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIBRARY = 'The library is open 9 AM to 6 PM.';
const SUGGESTIONS = ['When does the library open?', 'a?', 'b?', 'c?'];

const info = parseCampusInfo(`## Suggested questions
${SUGGESTIONS.map((question) => `- ${question}`).join('\n')}

## Library
Keywords: opening hours
${LIBRARY}
`);

const silentLogger = { warn() {}, error() {} };
const answerQuestion = createAnswerService({ info, llm: null, logger: silentLogger });
const server = createApp({
  publicDir: path.join(projectDir, 'public'),
  suggestions: info.suggestions,
  answerQuestion,
  logger: silentLogger,
});

let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function postChat(body, { raw = false } = {}) {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ? body : JSON.stringify(body),
  });
}

describe('JSON API', () => {
  test('lists the four suggested questions', async () => {
    const response = await fetch(`${baseUrl}/api/suggestions`);

    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).suggestions, SUGGESTIONS);
  });

  test('answers a question from the campus info', async () => {
    const response = await postChat({ message: '  When does the library open?  ' });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { answer: LIBRARY });
  });

  test('returns the fallback sentence for an unknown question', async () => {
    const response = await postChat({ message: 'Is there a swimming pool?' });

    assert.deepEqual(await response.json(), { answer: FALLBACK_ANSWER });
  });

  test('accepts earlier messages as history', async () => {
    const response = await postChat({
      message: 'And on Sunday?',
      history: [
        { role: 'user', content: 'When does the library open?' },
        { role: 'assistant', content: LIBRARY },
      ],
    });

    assert.equal(response.status, 200);
    assert.ok((await response.json()).answer);
  });

  test('rejects an empty question', async () => {
    const response = await postChat({ message: '   ' });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /type a question/);
  });

  test('rejects a question that is too long', async () => {
    const response = await postChat({ message: 'x'.repeat(501) });

    assert.equal(response.status, 400);
  });

  test('rejects a body that is not JSON', async () => {
    const response = await postChat('{not json', { raw: true });

    assert.equal(response.status, 400);
  });

  test('rejects a history that is not a list of messages', async () => {
    const response = await postChat({ message: 'Hi', history: 'nope' });
    assert.equal(response.status, 400);

    const badItem = await postChat({ message: 'Hi', history: [{ role: 'system', content: 'x' }] });
    assert.equal(badItem.status, 400);
  });

  test('rejects a request body that is too large', async () => {
    const response = await postChat({ message: 'x'.repeat(20 * 1024) });

    assert.equal(response.status, 413);
  });

  test('uses 405 for the wrong HTTP method', async () => {
    assert.equal((await fetch(`${baseUrl}/api/chat`)).status, 405);
    assert.equal((await fetch(`${baseUrl}/api/suggestions`, { method: 'POST' })).status, 405);
  });
});

describe('static files', () => {
  test('serves the chat page with safe headers', async () => {
    const response = await fetch(`${baseUrl}/`);
    const html = await response.text();

    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.match(html, /<title>CampusBuddy<\/title>/);
    assert.equal(response.headers.get('x-frame-options'), null, 'the preview needs to embed the page');
  });

  test('serves the stylesheet and script with the right type', async () => {
    const css = await fetch(`${baseUrl}/styles.css`);
    const js = await fetch(`${baseUrl}/app.js`);

    assert.match(css.headers.get('content-type'), /text\/css/);
    assert.match(js.headers.get('content-type'), /text\/javascript/);
  });

  test('returns 404 for missing files and for paths outside the public folder', async () => {
    assert.equal((await fetch(`${baseUrl}/missing.html`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/..%2Fpackage.json`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/%2e%2e/%2e%2e/package.json`)).status, 404);
    assert.equal((await fetch(`${baseUrl}/src/app.js`)).status, 404);
  });

  test('returns 400 for a malformed URL path', async () => {
    assert.equal((await fetch(`${baseUrl}/%E0%A4%A`)).status, 400);
  });
});
