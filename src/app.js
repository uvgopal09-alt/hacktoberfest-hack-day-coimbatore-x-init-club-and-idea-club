import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_ITEMS = 6;
const MAX_HISTORY_LENGTH = 1000;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// Note: no frame-ancestors or X-Frame-Options here, so the app can still be shown in preview frames.
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Creates the web server: the JSON API (/api/suggestions, /api/chat) and the static files in publicDir.
export function createApp({ publicDir, suggestions, answerQuestion, logger = console }) {
  const root = path.resolve(publicDir);

  return createServer(async (req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(name, value);
    }

    try {
      const { pathname } = new URL(req.url, 'http://localhost');

      if (pathname === '/api/suggestions') {
        requireMethod(req, ['GET']);
        return sendJson(res, 200, { suggestions });
      }

      if (pathname === '/api/chat') {
        requireMethod(req, ['POST']);
        const request = parseChatRequest(await readJsonBody(req));
        const answer = await answerQuestion(request);
        return sendJson(res, 200, { answer });
      }

      requireMethod(req, ['GET', 'HEAD']);
      return await sendStaticFile(res, root, pathname);
    } catch (error) {
      if (error instanceof HttpError) {
        return sendJson(res, error.status, { error: error.message });
      }
      logger.error(error);
      if (!res.headersSent) {
        return sendJson(res, 500, { error: 'Something went wrong. Please try again.' });
      }
      return res.end();
    }
  });
}

function requireMethod(req, allowed) {
  if (!allowed.includes(req.method)) {
    throw new HttpError(405, 'Method not allowed.');
  }
}

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, 'That message is too long.');
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'The question must be sent as JSON.');
  }
}

function parseChatRequest(body) {
  const { message, history } = body ?? {};
  const question = typeof message === 'string' ? message.trim() : '';
  if (!question) {
    throw new HttpError(400, 'Please type a question first.');
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    throw new HttpError(400, `Please keep questions under ${MAX_QUESTION_LENGTH} characters.`);
  }
  return { question, history: parseHistory(history) };
}

function parseHistory(history = []) {
  if (!Array.isArray(history)) {
    throw new HttpError(400, 'History must be a list of messages.');
  }
  return history.slice(-MAX_HISTORY_ITEMS).map((item) => {
    if ((item?.role !== 'user' && item?.role !== 'assistant') || typeof item.content !== 'string') {
      throw new HttpError(400, 'Each history item needs a role and text content.');
    }
    return { role: item.role, content: item.content.slice(0, MAX_HISTORY_LENGTH) };
  });
}

async function sendStaticFile(res, root, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch {
    throw new HttpError(400, 'Bad request.');
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  const contentType = CONTENT_TYPES[path.extname(filePath)];
  if (!contentType || !filePath.startsWith(root + path.sep)) {
    throw new HttpError(404, 'Not found.');
  }

  let body;
  try {
    body = await readFile(filePath);
  } catch {
    throw new HttpError(404, 'Not found.');
  }
  res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
  res.end(body);
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}
