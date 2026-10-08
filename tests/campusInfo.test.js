import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseCampusInfo } from '../src/campusInfo.js';

const VALID = `# Campus info

> Notes before the first heading are ignored.

## Suggested questions

- When does the library open?
- Where can I park?
1. How do I get an ID card?
* Where is the canteen?

## Library

Keywords: books, study
The library is open 9 AM to 6 PM.

### Holidays

It is closed on public holidays.

## Empty section
`;

test('reads exactly four suggestions and the topics under other headings', () => {
  const info = parseCampusInfo(VALID);

  assert.deepEqual(info.suggestions, [
    'When does the library open?',
    'Where can I park?',
    'How do I get an ID card?',
    'Where is the canteen?',
  ]);
  assert.equal(info.topics.length, 1, 'the empty section and the suggestions are not topics');
  assert.equal(info.topics[0].title, 'Library');
});

test('keeps keywords out of the answer and keeps sub-headings as answer text', () => {
  const [library] = parseCampusInfo(VALID).topics;

  assert.deepEqual(library.keywords, ['books', 'study']);
  assert.equal(
    library.answer,
    'The library is open 9 AM to 6 PM.\n\n### Holidays\n\nIt is closed on public holidays.',
  );
});

test('builds the AI context from topic titles and answers only', () => {
  const { context } = parseCampusInfo(VALID);

  assert.match(context, /^## Library\nThe library is open 9 AM to 6 PM\./);
  assert.doesNotMatch(context, /Suggested questions|Keywords|Notes before/);
});

test('rejects a suggestions section that does not list exactly four questions', () => {
  const threeQuestions = VALID.replace('* Where is the canteen?\n', '');

  assert.throws(() => parseCampusInfo(threeQuestions), /exactly 4 questions/);
});

test('rejects a file with no suggestions section', () => {
  assert.throws(() => parseCampusInfo('## Library\nOpen daily.\n'), /exactly 4 questions/);
});

test('rejects a file with no topics', () => {
  const onlySuggestions = `## Suggested questions
- a?
- b?
- c?
- d?
`;
  assert.throws(() => parseCampusInfo(onlySuggestions), /no topics/);
});
