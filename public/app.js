const GREETING = "Hi! I'm CampusBuddy. Ask me a question about campus, or tap a suggestion below.";
const ERROR_TEXT = "Sorry, I couldn't get an answer just now. Please try again.";
// How many earlier messages are sent back so follow-up questions make sense.
const HISTORY_LIMIT = 6;

const chatLog = document.getElementById('chat-log');
const suggestionBox = document.getElementById('suggestions');
const form = document.getElementById('composer');
const input = document.getElementById('question');
const sendButton = document.getElementById('send-button');

// Completed questions and answers from this page visit, sent with each new question.
const conversation = [];
let isWaiting = false;

class ApiError extends Error {}

function scrollToLatest() {
  chatLog.scrollTop = chatLog.scrollHeight;
}

// Text is always set with textContent, never innerHTML, so questions and answers cannot inject markup.
function addMessage(role, text) {
  const message = document.createElement('div');
  message.className = `message message-${role}`;
  message.textContent = text;
  chatLog.append(message);
  scrollToLatest();
}

// The chat log is a live region, so the answer itself is announced. The dots are decorative.
function showTypingIndicator() {
  const indicator = document.createElement('div');
  indicator.className = 'message message-bot typing';
  indicator.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) {
    indicator.append(document.createElement('span'));
  }
  chatLog.append(indicator);
  scrollToLatest();
  return indicator;
}

function setWaiting(waiting) {
  isWaiting = waiting;
  sendButton.disabled = waiting;
  for (const button of suggestionBox.querySelectorAll('button')) {
    button.disabled = waiting;
  }
}

async function askQuestion(question) {
  if (isWaiting) return;
  setWaiting(true);
  addMessage('user', question);
  const indicator = showTypingIndicator();

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: question, history: conversation.slice(-HISTORY_LIMIT) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ApiError(data.error || ERROR_TEXT);
    }
    if (typeof data.answer !== 'string') {
      throw new ApiError(ERROR_TEXT);
    }

    addMessage('bot', data.answer);
    conversation.push({ role: 'user', content: question }, { role: 'assistant', content: data.answer });
    conversation.splice(0, Math.max(0, conversation.length - HISTORY_LIMIT));
  } catch (error) {
    // Server messages (for example, "Please type a question first.") are safe to show.
    // Network failures get the generic message instead of a technical one such as "Failed to fetch".
    addMessage('bot', error instanceof ApiError ? error.message : ERROR_TEXT);
  } finally {
    indicator.remove();
    setWaiting(false);
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || isWaiting) return;
  input.value = '';
  askQuestion(question);
});

async function loadSuggestions() {
  try {
    const response = await fetch('/api/suggestions');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const { suggestions } = await response.json();
    for (const suggestion of suggestions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion';
      button.textContent = suggestion;
      button.addEventListener('click', () => askQuestion(suggestion));
      suggestionBox.append(button);
    }
  } catch {
    suggestionBox.hidden = true;
  }
}

addMessage('bot', GREETING);
loadSuggestions();
