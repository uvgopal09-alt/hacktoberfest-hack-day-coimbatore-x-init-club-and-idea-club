import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createAnswerService, GREETING_REPLY, smalltalkReply } from '../src/answerService.js';
import { parseCampusInfo } from '../src/campusInfo.js';
import { FALLBACK_ANSWER } from '../src/localAnswers.js';

const LIBRARY = 'The library is open 9 AM to 6 PM.';
const info = parseCampusInfo(`## Suggested questions
- When does the library open?
- a?
- b?
- c?

## Library
Keywords: opening hours
${LIBRARY}
`);

const silentLogger = { warn() {}, error() {} };

// A fake AI service that counts calls and answers with the reply set by each test.
let server;
let baseUrl;
let calls;
let respond;

before(async () => {
  server = createServer((req, res) => {
    calls += 1;
    respond(req, res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

after(() => {
  server.closeAllConnections();
  server.close();
});

const aiReply = (content) => (req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ choices: [{ message: { content } }] }));
};

describe('smalltalkReply', () => {
  test('greets and thanks people without searching the campus info', () => {
    assert.equal(smalltalkReply('Hi!'), GREETING_REPLY);
    assert.equal(smalltalkReply('hello there'), GREETING_REPLY);
    assert.match(smalltalkReply('Thank you!'), /welcome/i);
    assert.equal(smalltalkReply('bye'), 'Bye! Have a great day.');
  });

  test('does not treat a greeting plus a question as small talk', () => {
    assert.equal(smalltalkReply('hi, when does the library open?'), null);
    assert.equal(smalltalkReply('hello where is the library'), null);
  });
});

describe('createAnswerService', () => {
  test('answers greetings without calling the AI service', async () => {
    calls = 0;
    respond = aiReply('should not be used');
    const answerQuestion = createAnswerService({ info, llm: { apiKey: 'k', baseUrl, model: 'm' }, logger: silentLogger });

    assert.equal(await answerQuestion({ question: 'hi' }), GREETING_REPLY);
    assert.equal(calls, 0);
  });

  test('uses keyword matching when no AI key is configured', async () => {
    calls = 0;
    const answerQuestion = createAnswerService({ info, llm: null, logger: silentLogger });

    assert.equal(await answerQuestion({ question: 'When does the library open?' }), LIBRARY);
    assert.equal(await answerQuestion({ question: 'Is there a pool?' }), FALLBACK_ANSWER);
    assert.equal(calls, 0);
  });

  test('uses the AI answer when it is configured and works', async () => {
    calls = 0;
    respond = aiReply('It opens at 9 AM.');
    const answerQuestion = createAnswerService({ info, llm: { apiKey: 'k', baseUrl, model: 'm' }, logger: silentLogger });

    assert.equal(await answerQuestion({ question: 'What time does it open?' }), 'It opens at 9 AM.');
    assert.equal(calls, 1);
  });

  test('falls back to keyword matching and logs a warning when the AI service fails', async () => {
    calls = 0;
    respond = (req, res) => {
      res.writeHead(500);
      res.end('server down');
    };
    const warnings = [];
    const logger = { warn: (message) => warnings.push(message), error() {} };
    const answerQuestion = createAnswerService({ info, llm: { apiKey: 'k', baseUrl, model: 'm' }, logger });

    assert.equal(await answerQuestion({ question: 'When does the library open?' }), LIBRARY);
    assert.equal(calls, 1);
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /HTTP 500/);
  });
});
