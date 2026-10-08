import { readFile } from 'node:fs/promises';

export const SUGGESTION_COUNT = 4;
const SUGGESTIONS_TITLE = 'suggested questions';

// Reads the campus information Markdown file.
//
// Format:
//   ## Suggested questions      -> exactly 4 bullet points (the buttons students see)
//   ## Any other heading        -> one topic. The text under it is the answer.
//   Keywords: a, b, c           -> optional line with extra words students might use
// Text before the first "## " heading is ignored, so you can add a title or notes there.
export async function loadCampusInfo(filePath) {
  let markdown;
  try {
    markdown = await readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Campus info file not found: ${filePath}`);
    }
    throw error;
  }
  return parseCampusInfo(markdown);
}

export function parseCampusInfo(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^##\s+(.*\S)\s*$/);
    if (heading) {
      current = { title: heading[1], lines: [] };
      sections.push(current);
    } else if (current) {
      current.lines.push(line);
    }
  }

  let suggestions = null;
  const topics = [];
  for (const section of sections) {
    if (section.title.toLowerCase() === SUGGESTIONS_TITLE) {
      suggestions = parseSuggestions(section.lines);
    } else {
      const topic = parseTopic(section);
      if (topic) topics.push(topic);
    }
  }

  if (!suggestions || suggestions.length !== SUGGESTION_COUNT) {
    throw new Error(
      `The "Suggested questions" section must list exactly ${SUGGESTION_COUNT} questions as bullet points.`,
    );
  }
  if (topics.length === 0) {
    throw new Error('The campus info has no topics. Add at least one "## " section with an answer under it.');
  }

  // Plain-text version of the topics, used as the only source for AI answers.
  const context = topics.map((topic) => `## ${topic.title}\n${topic.answer}`).join('\n\n');
  return { suggestions, topics, context };
}

function parseSuggestions(lines) {
  return lines
    .map((line) => line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*\S)\s*$/))
    .filter(Boolean)
    .map((match) => match[1]);
}

function parseTopic({ title, lines }) {
  const keywords = [];
  const answerLines = [];
  for (const line of lines) {
    const match = line.match(/^\s*keywords?\s*:(.*)$/i);
    if (match) {
      keywords.push(...match[1].split(',').map((word) => word.trim()).filter(Boolean));
    } else {
      answerLines.push(line);
    }
  }
  const answer = answerLines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return answer ? { title, keywords, answer } : null;
}
