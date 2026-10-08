import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createLlmAnswerer, toStudentAnswer } from '../src/llmAnswers.js';
import { FALLBACK_ANSWER } from '../src/localAnswers.js';

const API_KEY = 'fake-key-for-tests';
const CONTEXT = '## Library\nThe library is open 9 AM to 6 PM.';

// A fake OpenAI-compatible server. Each test sets `nextReply` before asking a question.
let server;
let baseUrl;
let requests;
let nextReply;

before(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({ method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body) });
      nextReply(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

function replyWithContent(content) {
  return (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] }));
  };
}

function makeAnswerer(overrides = {}) {
  return createLlmAnswerer({ apiKey: API_KEY, baseUrl, model: 'test-model', context: CONTEXT, ...overrides });
}

describe('AI answers', () => {
  test('sends the rules, campus info, history and question, and returns the reply', async () => {
    requests = [];
    nextReply = replyWithContent('The library opens at 9 AM.');
    const history = [
      { role: 'user', content: 'Hi' },
      { role: 'assistant', content: 'Hello!' },
    ];

    const reply = await makeAnswerer()({ question: 'When does it open?', history });

    assert.equal(reply, 'The library opens at 9 AM.');
    const [request] = requests;
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, `Bearer ${API_KEY}`);
    assert.equal(request.body.model, 'test-model');

    const [system, ...rest] = request.body.messages;
    assert.equal(system.role, 'system');
    assert.ok(system.content.includes(CONTEXT), 'the campus info is in the system prompt');
    assert.ok(system.content.includes(FALLBACK_ANSWER), 'the fallback sentence is in the rules');
    assert.deepEqual(rest, [...history, { role: 'user', content: 'When does it open?' }]);
  });

  test('replaces any "I do not have that info" wording with the exact fallback', async () => {
    requests = [];
    nextReply = replyWithContent('Sorry, I don’t have that information. Please ask the office.');

    assert.equal(await makeAnswerer()({ question: 'Is there a pool?' }), FALLBACK_ANSWER);
  });

  test('throws a short error that does not include the API key when the service rejects the request', async () => {
    requests = [];
    nextReply = (req, res) => {
      res.writeHead(401, { 'Content-Type': 'text/plain' });
      res.end(`invalid key ${API_KEY}`);
    };

    await assert.rejects(makeAnswerer()({ question: 'Hello?' }), (error) => {
      assert.match(error.message, /HTTP 401/);
      assert.ok(!error.message.includes(API_KEY), 'the key must never be echoed');
      return true;
    });
  });

  test('throws when the reply has no text', async () => {
    requests = [];
    nextReply = (req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [] }));
    };

    await assert.rejects(makeAnswerer()({ question: 'Hello?' }), /did not include a text answer/);
  });

  test('gives up when the service takes too long', async () => {
    requests = [];
    nextReply = () => {}; // never answers

    await assert.rejects(makeAnswerer({ timeoutMs: 100 })({ question: 'Hello?' }));
  });
});

describe('toStudentAnswer', () => {
  test('keeps a normal answer, trimmed', () => {
    assert.equal(toStudentAnswer('  Open 9 AM to 6 PM.  '), 'Open 9 AM to 6 PM.');
  });

  test('turns an empty answer into the fallback', () => {
    assert.equal(toStudentAnswer('   '), FALLBACK_ANSWER);
  });

  test('turns the exact fallback sentence into the fallback', () => {
    assert.equal(toStudentAnswer(FALLBACK_ANSWER), FALLBACK_ANSWER);
  });
});
