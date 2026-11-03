const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

// Use a temporary copy of the sample data so the tests never change data/tokens.json
const tempDir = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'clinic-tokens-'));
process.env.TOKENS_FILE = path.join(tempDir, 'tokens.json');

const { app, loadTokens, DATA_FILE } = require('../server');

let server;
let baseUrl;

before(async () => {
  await fs.copyFile(path.join(__dirname, '..', 'data', 'tokens.json'), DATA_FILE);
  await loadTokens();
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://localhost:${server.address().port}`;
});

after(async () => {
  server.close();
  await fs.rm(tempDir, { recursive: true, force: true });
});

function request(method, urlPath, body) {
  const options = { method, headers: {} };
  if (body !== undefined) {
    options.headers['Content-Type'] = 'application/json';
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return fetch(baseUrl + urlPath, options).then(async (res) => ({
    status: res.status,
    contentType: res.headers.get('content-type'),
    body: await res.json(),
  }));
}

async function readDataFile() {
  return JSON.parse(await fs.readFile(DATA_FILE, 'utf8'));
}

// --- Sample data checks (tokens 1-2 seen, 3-5 waiting) ---

test('GET /tokens lists all five sample tokens as JSON', async () => {
  const res = await request('GET', '/tokens');
  assert.equal(res.status, 200);
  assert.match(res.contentType, /application\/json/);
  assert.equal(res.body.length, 5);
});

test('GET /tokens?doctor=dental returns only dental tokens', async () => {
  const res = await request('GET', '/tokens?doctor=dental');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map((token) => token.tokenNumber), [2, 4]);
});

test('GET /tokens?status=waiting returns only waiting tokens', async () => {
  const res = await request('GET', '/tokens?status=waiting');
  assert.deepEqual(res.body.map((token) => token.tokenNumber), [3, 4, 5]);
});

test('GET /tokens combines doctor and status filters', async () => {
  const res = await request('GET', '/tokens?doctor=general&status=waiting');
  assert.deepEqual(res.body.map((token) => token.tokenNumber), [3, 5]);
});

test('GET /tokens returns 400 for an unknown filter value', async () => {
  assert.equal((await request('GET', '/tokens?doctor=eye')).status, 400);
  assert.equal((await request('GET', '/tokens?status=done')).status, 400);
});

test('GET /tokens/stats summarises the sample data', async () => {
  const res = await request('GET', '/tokens/stats');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { waiting: 3, seen: 2, nextWaitingToken: 3 });
});

test('GET /tokens/stats?doctor=dental summarises one doctor', async () => {
  const res = await request('GET', '/tokens/stats?doctor=dental');
  assert.deepEqual(res.body, { waiting: 1, seen: 1, nextWaitingToken: 4 });
});

test('GET /tokens/:id returns one token, 404 if missing, 400 if invalid', async () => {
  assert.equal((await request('GET', '/tokens/3')).body.patientName, 'Sneha');
  assert.equal((await request('GET', '/tokens/999')).status, 404);
  assert.equal((await request('GET', '/tokens/abc')).status, 400);
});

// --- Changes ---

test('POST /tokens gives the next token number with 201 and saves it', async () => {
  const res = await request('POST', '/tokens', { patientName: '  Kavya ', doctor: 'dental' });
  assert.equal(res.status, 201);
  assert.deepEqual(res.body, { id: 6, tokenNumber: 6, patientName: 'Kavya', doctor: 'dental', status: 'waiting' });
  assert.deepEqual((await readDataFile()).at(-1), res.body);
});

test('POST /tokens returns 400 with a JSON error when patient name or doctor is missing', async () => {
  const cases = [
    [{ doctor: 'general' }, /patientName is required/],
    [{ patientName: '   ', doctor: 'general' }, /patientName is required/],
    [{ patientName: 'Ravi' }, /doctor is required/],
    [{ patientName: 'Ravi', doctor: '' }, /doctor is required/],
    [{ patientName: 'Ravi', doctor: 'eye' }, /doctor must be one of/],
    [{ patientName: 'x'.repeat(51), doctor: 'general' }, /at most 50/],
    [['Ravi'], /JSON object/],
  ];
  for (const [body, message] of cases) {
    const res = await request('POST', '/tokens', body);
    assert.equal(res.status, 400);
    assert.match(res.body.error, message);
  }
  assert.equal((await request('POST', '/tokens', '{"patientName": "Ravi"')).status, 400);
});

test('PATCH /tokens/:id/seen marks a token as seen and saves it', async () => {
  const res = await request('PATCH', '/tokens/3/seen');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'seen');
  assert.equal((await readDataFile()).find((token) => token.id === 3).status, 'seen');
  const stats = await request('GET', '/tokens/stats');
  assert.equal(stats.body.nextWaitingToken, 4);
});

test('PATCH /tokens/:id/seen is safe to repeat, and returns 404 for a missing id', async () => {
  assert.equal((await request('PATCH', '/tokens/3/seen')).status, 200);
  assert.equal((await request('PATCH', '/tokens/999/seen')).status, 404);
  assert.equal((await request('PATCH', '/tokens/abc/seen')).status, 400);
});

test('changes are still there after reloading the file (restart)', async () => {
  await loadTokens();
  assert.equal((await request('GET', '/tokens/6')).body.patientName, 'Kavya');
  assert.equal((await request('GET', '/tokens/3')).body.status, 'seen');
});

test('parallel POST requests get unique token numbers and are all saved', async () => {
  const names = ['Anil', 'Bina', 'Chirag', 'Divya', 'Esha'];
  const results = await Promise.all(
    names.map((patientName) => request('POST', '/tokens', { patientName, doctor: 'general' })),
  );
  assert.equal(new Set(results.map((res) => res.body.tokenNumber)).size, names.length);
  const saved = await readDataFile();
  for (const name of names) {
    assert.ok(saved.some((token) => token.patientName === name));
  }
});

test('stats show null when nobody is waiting', async () => {
  const waiting = (await request('GET', '/tokens?status=waiting')).body;
  for (const token of waiting) {
    await request('PATCH', `/tokens/${token.id}/seen`);
  }
  const res = await request('GET', '/tokens/stats');
  assert.equal(res.body.waiting, 0);
  assert.equal(res.body.nextWaitingToken, null);
});

test('unknown routes return a JSON 404', async () => {
  const res = await request('DELETE', '/tokens/1');
  assert.equal(res.status, 404);
  assert.match(res.contentType, /application\/json/);
});

// --- Loading edge cases ---

test('loadTokens starts empty when the file is missing, without creating it', async () => {
  await fs.rm(DATA_FILE);
  assert.deepEqual(await loadTokens(), []);
  await assert.rejects(fs.access(DATA_FILE));
});

test('loadTokens throws a clear error for invalid JSON or a non-array file', async () => {
  await fs.writeFile(DATA_FILE, '{ not json');
  await assert.rejects(loadTokens(), /does not contain valid JSON/);
  await fs.writeFile(DATA_FILE, '{"id": 1}');
  await assert.rejects(loadTokens(), /must contain a JSON array/);
});
