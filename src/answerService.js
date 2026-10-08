import { createLlmAnswerer } from './llmAnswers.js';
import { createLocalAnswerer } from './localAnswers.js';

export const GREETING_REPLY = "Hi! I'm CampusBuddy. Ask me a question about campus, or tap a suggestion below.";

// Greetings and thanks are answered directly, without searching the campus info.
// Each pattern must match the whole message, so "hi, where is the library?" is still a question.
const SMALLTALK = [
  { pattern: /^(hi|hello|hey|hola|good (morning|afternoon|evening))( there| buddy| campusbuddy)?$/, reply: GREETING_REPLY },
  { pattern: /^(thanks|thank you|thx|ty)( so much| a lot| very much)?$/, reply: "You're welcome! Ask me anything else about campus." },
  { pattern: /^(bye|goodbye|see you)$/, reply: 'Bye! Have a great day.' },
];

export function smalltalkReply(question) {
  const normalized = question
    .toLowerCase()
    .replace(/[^\p{L}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return SMALLTALK.find(({ pattern }) => pattern.test(normalized))?.reply ?? null;
}

// Chooses how to answer: smalltalk, then the AI model if configured, then keyword matching.
// If the AI call fails, the student still gets a keyword answer, and the failure is logged.
export function createAnswerService({ info, llm = null, logger = console }) {
  const answerWithKeywords = createLocalAnswerer(info);
  const answerWithAi = llm ? createLlmAnswerer({ ...llm, context: info.context }) : null;

  return async function answerQuestion({ question, history = [] }) {
    const reply = smalltalkReply(question);
    if (reply) return reply;

    if (answerWithAi) {
      try {
        return await answerWithAi({ question, history });
      } catch (error) {
        logger.warn(`AI answer failed, so CampusBuddy used keyword matching instead. ${error.message}`);
      }
    }
    return answerWithKeywords(question);
  };
}
