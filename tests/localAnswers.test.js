import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { parseCampusInfo } from '../src/campusInfo.js';
import { createLocalAnswerer, FALLBACK_ANSWER, termsOf } from '../src/localAnswers.js';

const LIBRARY = 'The library is open Monday to Saturday, 9 AM to 6 PM. It is closed on Sundays.';
const PARKING = 'Bicycles can be parked at the racks next to the main gate. Cars use the lot behind the admin block.';
const ID_CARD = 'For a lost card, visit the college office to get a replacement.';
const BUS = 'Buses leave the main gate at 7:30 AM and 4:30 PM.';
const FEES = 'Fees can be paid online or at the college office.';
const OFFICE = 'The college office is open Monday to Friday, 9 AM to 4 PM.';

const info = parseCampusInfo(`## Suggested questions
- When does the library open?
- Where can I park my bike?
- How do I replace a lost ID card?
- When are the buses?

## Library
Keywords: opening hours, timings
${LIBRARY}

## Parking
Keywords: bike, bicycle, car
${PARKING}

## ID card
Keywords: identity card, lost card
${ID_CARD}

## Bus
Keywords: transport, shuttle
${BUS}

## Fees
Keywords: fee, payment
${FEES}

## College office
Keywords: office, contact, phone, admin
${OFFICE}
`);
const answer = createLocalAnswerer(info);

describe('keyword answers', () => {
  test('answers with the topic that covers the question', () => {
    assert.equal(answer('When does the library open?'), LIBRARY);
    assert.equal(answer('Where can I park my bike?'), PARKING);
    assert.equal(answer('When are the buses?'), BUS);
  });

  test('matches plurals, synonyms and keywords', () => {
    assert.equal(answer('What time is the library open on Sunday?'), LIBRARY);
    assert.equal(answer('What timings does the library have?'), LIBRARY);
    assert.equal(answer('Where do I park my bicycle?'), PARKING);
    assert.equal(answer('Do you have a bus shuttle?'), BUS);
  });

  test('matches a word that is a shared start of a campus word', () => {
    // "replace" is in the question, "replacement" is in the campus info.
    assert.equal(answer('How do I replace a lost ID card?'), ID_CARD);
  });

  test('corrects a single typo in a longer word', () => {
    assert.equal(answer('libary opening hours'), LIBRARY);
  });

  test('ignores common question words such as should, much and available', () => {
    assert.equal(answer('How much are the fees?'), FEES);
    assert.equal(answer('Who should I contact for help?'), OFFICE);
    assert.equal(answer('Is the library available on Sunday?'), LIBRARY);
  });

  test('falls back when a question mentions something the info does not cover', () => {
    assert.equal(answer('Does the library have a swimming pool?'), FALLBACK_ANSWER);
    assert.equal(answer('What is the capital of France?'), FALLBACK_ANSWER);
    assert.equal(answer('Is there a canteen?'), FALLBACK_ANSWER);
    assert.equal(answer('What is the fee for the library?'), FALLBACK_ANSWER);
    assert.equal(answer('How much does the library cost?'), FALLBACK_ANSWER);
  });

  test('falls back when a question has no meaningful words', () => {
    assert.equal(answer('???'), FALLBACK_ANSWER);
    assert.equal(answer('please tell me'), FALLBACK_ANSWER);
  });

  test('uses the exact fallback sentence from the brief', () => {
    assert.equal(FALLBACK_ANSWER, "I don't have that info, please contact the college office.");
  });
});

describe('term normalisation', () => {
  test('treats Wi-Fi spellings the same way', () => {
    assert.deepEqual(termsOf('Wi-Fi'), termsOf('wifi'));
    assert.deepEqual(termsOf('wi fi'), ['wifi']);
  });

  test('drops stopwords and maps synonyms to one term', () => {
    assert.deepEqual(termsOf('What is the cost of the bike?'), ['fee', 'bicycle']);
  });
});
