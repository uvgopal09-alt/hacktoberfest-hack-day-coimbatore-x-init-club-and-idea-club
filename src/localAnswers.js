// Keyword answers for when no AI model is configured.
//
// A topic answers a question only when it covers every meaningful word in the question.
// CampusBuddy never stitches together partial matches or guesses. If no single topic
// covers the question, the fallback answer is returned instead.

export const FALLBACK_ANSWER = "I don't have that info, please contact the college office.";

// Words that carry no meaning for matching: grammar, question words, filler and contractions.
const STOPWORDS = new Set([
  // Grammar: articles, pronouns, prepositions, auxiliary verbs and question words.
  'a', 'about', 'all', 'also', 'am', 'an', 'and', 'any', 'are', 'as', 'at', 'be', 'been', 'being', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'done', 'each', 'every', 'for', 'from', 'get', 'got',
  'had', 'has', 'have', 'he', 'her', 'here', 'hers', 'him', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it',
  'its', 'just', 'long', 'many', 'may', 'me', 'might', 'more', 'most', 'much', 'must', 'my', 'no', 'not', 'of',
  'on', 'or', 'other', 'our', 'out', 'over', 'pm', 'please', 'shall', 'she', 'should', 'so', 'some', 'than',
  'that', 'the', 'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'to', 'too', 'under', 'up',
  'us', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'who', 'why', 'will', 'with', 'would',
  'you', 'your',
  // Question filler that rarely appears in campus information.
  'tell', 'know', 'want', 'need', 'like', 'give', 'let', 'show', 'find', 'help', 'information', 'info',
  'details', 'detail', 'college', 'campus', 'student', 'students', 'someone', 'anyone', 'everyone',
  'people', 'today', 'tomorrow', 'now', 'currently', 'exactly', 'located', 'location', 'place',
  'somewhere', 'new', 'available', 'day', 'go', 'going', 'come', 'take', 'make', 'see', 'look', 'ask',
  'check', 'way', 'thing', 'something', 'anything', 'thanks', 'thank', 'hi', 'hello', 'hey', 'ok', 'okay', 'sure',
  // Parts of contractions, such as "don't" -> "don" + "t".
  'don', 'doesn', 'didn', 'isn', 'aren', 'wasn', 'weren', 'won', 'couldn', 'shouldn', 'wouldn',
  'haven', 'hasn', 'hadn', 'll', 're', 've', 'd', 's', 'm', 't',
]);

// Words students might use, grouped under the word the campus information uses.
const SYNONYM_GROUPS = {
  hour: ['timing', 'time', 'open', 'opening', 'opens', 'close', 'closed', 'closes', 'closing', 'schedule'],
  fee: ['cost', 'price', 'charge', 'payment', 'pay', 'paid', 'fare', 'amount', 'tuition'],
  bicycle: ['bike', 'cycle', 'cycling'],
  park: ['parking', 'parked'],
  canteen: ['cafeteria', 'cafe', 'mess', 'food', 'lunch', 'breakfast', 'dinner', 'dining', 'eat', 'meal'],
  hostel: ['dormitory', 'dorm', 'accommodation', 'residence', 'boarding'],
  id: ['ids', 'identity', 'identification'],
  exam: ['examination', 'test'],
  contact: ['phone', 'telephone', 'call', 'email', 'mail', 'reach'],
  office: ['admin', 'administration'],
  wifi: ['wi', 'fi', 'internet', 'wireless'],
  bus: ['shuttle', 'transport', 'transportation'],
};

// Turns a word into its singular form, so "buses" and "bus" match. Only simple plural rules.
function singular(word) {
  if (word.length > 4 && word.endsWith('ies')) return `${word.slice(0, -3)}y`;
  if (word.length > 4 && /(s|x|z|ch|sh)es$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s') && !/(ss|us|is)$/.test(word)) return word.slice(0, -1);
  return word;
}

const SYNONYMS = new Map(
  Object.entries(SYNONYM_GROUPS).flatMap(([canonical, variants]) =>
    variants.map((variant) => [singular(variant), canonical]),
  ),
);

// Splits text into the unique matching terms it contains.
export function termsOf(text) {
  const terms = text
    .toLowerCase()
    .replace(/wi-?fi/g, 'wifi')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !STOPWORDS.has(word))
    .map((word) => {
      const base = singular(word);
      return SYNONYMS.get(base) ?? base;
    })
    .filter((term) => !STOPWORDS.has(term));
  return [...new Set(terms)];
}

export function createLocalAnswerer(info) {
  const topics = info.topics.map((topic) => {
    const titleTerms = new Set(termsOf(`${topic.title} ${topic.keywords.join(' ')}`));
    const allTerms = new Set([...titleTerms, ...termsOf(topic.answer)]);
    return { answer: topic.answer, titleTerms, allTerms };
  });

  const vocabulary = [...new Set(topics.flatMap((topic) => [...topic.allTerms]))];
  const topicsWithTerm = new Map(
    vocabulary.map((term) => [term, topics.filter((topic) => topic.allTerms.has(term)).length]),
  );
  // Rarer words are more specific, so they count for more when several topics are candidates.
  const weight = (term) => Math.log(1 + topics.length / topicsWithTerm.get(term));

  return function answer(question) {
    const terms = [...new Set(termsOf(question).map((term) => resolveTerm(term, vocabulary)))];
    if (terms.length === 0) return FALLBACK_ANSWER;

    let best = null;
    for (const topic of topics) {
      if (!terms.every((term) => topic.allTerms.has(term))) continue;
      // Words in a topic's title count double.
      const score = terms.reduce(
        (sum, term) => sum + weight(term) * (topic.titleTerms.has(term) ? 2 : 1),
        0,
      );
      if (!best || score > best.score) best = { answer: topic.answer, score };
    }
    return best ? best.answer : FALLBACK_ANSWER;
  };
}

// Finds the campus-info word a question word refers to, or returns the word unchanged.
function resolveTerm(term, vocabulary) {
  if (vocabulary.includes(term)) return term;
  // Shared start, such as "replace" -> "replacement". Only for longer words to avoid false matches.
  const sharedStart = vocabulary.find(
    (known) =>
      Math.min(known.length, term.length) >= 5 && (known.startsWith(term) || term.startsWith(known)),
  );
  if (sharedStart) return sharedStart;
  // A single typo, such as "libary" -> "library".
  const typo = term.length >= 5 ? vocabulary.find((known) => withinOneEdit(term, known)) : undefined;
  return typo ?? term;
}

// True when the two words differ by at most one insertion, deletion or substitution.
function withinOneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (a.length < b.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  edits += (a.length - i) + (b.length - j);
  return edits <= 1;
}
