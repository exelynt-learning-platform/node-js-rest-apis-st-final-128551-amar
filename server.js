const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.TOKENS_FILE || path.join(__dirname, 'data', 'tokens.json');

const DOCTORS = ['general', 'dental'];
const STATUSES = ['waiting', 'seen'];
const MAX_NAME_LENGTH = 50;

// Tokens are loaded from DATA_FILE at start-up and saved after every change
let tokens = [];

// Every change goes through this queue, so two requests never write the file at the same time
let changeQueue = Promise.resolve();

app.use(express.json());

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

// ---------- Loading and saving ----------

// Reads tokens from the JSON file into memory. Read-only: it never writes to disk.
// A missing file means "no tokens yet" (the file is created on the first save).
// Invalid JSON, or JSON that is not an array, throws so the server stops instead of losing data.
async function loadTokens() {
  let fileContents;
  try {
    fileContents = await fs.readFile(DATA_FILE, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      tokens = [];
      return tokens;
    }
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(fileContents);
  } catch (error) {
    throw new Error(`${DATA_FILE} does not contain valid JSON: ${error.message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error(`${DATA_FILE} must contain a JSON array of tokens`);
  }

  tokens = parsed;
  return tokens;
}

// Writes to a temporary file first, then renames it, so a crash never leaves a half-written file
async function saveTokens(tokenList) {
  await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
  const tempFile = `${DATA_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(tokenList, null, 2) + '\n', 'utf8');
  await fs.rename(tempFile, DATA_FILE);
}

// Applies a change to a copy of the list, saves it, and only then keeps it in memory
function changeTokens(applyChange) {
  const run = changeQueue.then(async () => {
    const draft = structuredClone(tokens);
    const result = applyChange(draft);
    if (result.changed) {
      await saveTokens(draft);
      tokens = draft;
    }
    return result;
  });
  changeQueue = run.catch(() => {});
  return run;
}

// ---------- Helpers ----------

function nextValue(tokenList, field) {
  return tokenList.reduce((max, token) => Math.max(max, token[field]), 0) + 1;
}

// Returns a positive integer id from the URL, or null if it is not valid
function parseId(value) {
  return /^[1-9]\d*$/.test(value) ? Number(value) : null;
}

// Checks the ?doctor= and ?status= filters. Returns an error message, or null when they are valid.
function validateFilters({ doctor, status }) {
  if (doctor !== undefined && !DOCTORS.includes(doctor)) {
    return `doctor filter must be one of: ${DOCTORS.join(', ')}`;
  }
  if (status !== undefined && !STATUSES.includes(status)) {
    return `status filter must be one of: ${STATUSES.join(', ')}`;
  }
  return null;
}

function applyFilters(tokenList, { doctor, status }) {
  return tokenList.filter(
    (token) => (!doctor || token.doctor === doctor) && (!status || token.status === status),
  );
}

// Checks the body of POST /tokens. Returns an error message, or null when it is valid.
function validateNewToken(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return 'Request body must be a JSON object with patientName and doctor';
  }

  const { patientName, doctor } = body;

  if (typeof patientName !== 'string' || patientName.trim() === '') {
    return 'patientName is required';
  }
  if (patientName.trim().length > MAX_NAME_LENGTH) {
    return `patientName must be at most ${MAX_NAME_LENGTH} characters`;
  }
  if (doctor === undefined || doctor === null || doctor === '') {
    return 'doctor is required';
  }
  if (!DOCTORS.includes(doctor)) {
    return `doctor must be one of: ${DOCTORS.join(', ')}`;
  }
  return null;
}

// ---------- Routes ----------

// Runs before every /:id route and rejects ids that are not positive whole numbers
app.param('id', (req, res, next, value) => {
  const id = parseId(value);
  if (id === null) {
    return sendError(res, 400, 'id must be a positive whole number');
  }
  req.tokenId = id;
  next();
});

// GET /tokens - all tokens, optionally filtered: /tokens?doctor=dental&status=waiting
app.get('/tokens', (req, res) => {
  const filterError = validateFilters(req.query);
  if (filterError) {
    return sendError(res, 400, filterError);
  }
  res.json(applyFilters(tokens, req.query));
});

// GET /tokens/stats - how many are waiting and seen, and the next waiting token number.
// Accepts the same ?doctor= filter, for example /tokens/stats?doctor=dental
app.get('/tokens/stats', (req, res) => {
  const filterError = validateFilters({ doctor: req.query.doctor });
  if (filterError) {
    return sendError(res, 400, filterError);
  }

  const doctorTokens = applyFilters(tokens, { doctor: req.query.doctor });
  const waitingTokens = doctorTokens.filter((token) => token.status === 'waiting');
  const nextWaitingToken = waitingTokens.length
    ? Math.min(...waitingTokens.map((token) => token.tokenNumber))
    : null;

  res.json({
    waiting: waitingTokens.length,
    seen: doctorTokens.filter((token) => token.status === 'seen').length,
    nextWaitingToken,
  });
});

// GET /tokens/:id - one token, or 404 if it does not exist
app.get('/tokens/:id', (req, res) => {
  const token = tokens.find((item) => item.id === req.tokenId);
  if (!token) {
    return sendError(res, 404, `Token with id ${req.tokenId} not found`);
  }
  res.json(token);
});

// POST /tokens - give a walk-in patient the next token number (201)
app.post('/tokens', async (req, res) => {
  const validationError = validateNewToken(req.body);
  if (validationError) {
    return sendError(res, 400, validationError);
  }

  const { token } = await changeTokens((draft) => {
    const newToken = {
      id: nextValue(draft, 'id'),
      tokenNumber: nextValue(draft, 'tokenNumber'),
      patientName: req.body.patientName.trim(),
      doctor: req.body.doctor,
      status: 'waiting',
    };
    draft.push(newToken);
    return { changed: true, token: newToken };
  });

  res.status(201).json(token);
});

// PATCH /tokens/:id/seen - mark a token as seen (marking it again is harmless and returns 200)
app.patch('/tokens/:id/seen', async (req, res) => {
  const { found, token } = await changeTokens((draft) => {
    const draftToken = draft.find((item) => item.id === req.tokenId);
    if (!draftToken) {
      return { found: false, changed: false };
    }
    const alreadySeen = draftToken.status === 'seen';
    draftToken.status = 'seen';
    return { found: true, changed: !alreadySeen, token: draftToken };
  });

  if (!found) {
    return sendError(res, 404, `Token with id ${req.tokenId} not found`);
  }
  res.json(token);
});

// Unknown routes get a JSON 404
app.use((req, res) => {
  sendError(res, 404, `Route ${req.method} ${req.path} not found`);
});

// Invalid JSON bodies and unexpected errors (for example a failed file write) return JSON
app.use((error, req, res, next) => {
  if (error.type === 'entity.parse.failed') {
    return sendError(res, 400, 'Request body is not valid JSON');
  }
  console.error(error);
  sendError(res, 500, 'Something went wrong');
});

// ---------- Start-up ----------

async function startServer() {
  try {
    await loadTokens();
  } catch (error) {
    console.error(`Could not start: ${error.message}`);
    process.exit(1);
  }

  const server = http.createServer(app);

  // Attach the error listener before listening so startup errors are always caught
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Stop the other server or set a different PORT.`);
    } else {
      console.error('Server failed to start:', error.message);
    }
    process.exit(1);
  });

  server.listen(PORT, () => {
    console.log(`Clinic token queue API running at http://localhost:${PORT}`);
    console.log(`Loaded ${tokens.length} tokens from ${path.relative(process.cwd(), DATA_FILE)}`);
  });
}

// Start the server only when this file is run directly (tests import the app instead)
if (require.main === module) {
  startServer();
}

module.exports = { app, loadTokens, DATA_FILE };
