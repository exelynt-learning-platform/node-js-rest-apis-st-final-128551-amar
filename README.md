# Clinic Token Queue API

**Author:** Amar Jadhav

A digital token queue for walk-in patients at a small neighbourhood clinic, built with **Node.js 22** and **Express**. Reception gives each patient the next token number, doctors see who is waiting, and the queue is saved to `data/tokens.json`, so nothing is lost if the server restarts.

## What the API does

Each token has an `id`, a `tokenNumber`, the patient's first name (`patientName`), a `doctor` (`general` or `dental`) and a `status` (`waiting` or `seen`).

| Method | Route | What it does | Status codes |
|---|---|---|---|
| GET | `/tokens` | List all tokens. Filter with `?doctor=general\|dental` and/or `?status=waiting\|seen` | 200, 400 for an unknown filter value |
| GET | `/tokens/stats` | `{ waiting, seen, nextWaitingToken }`. Add `?doctor=dental` for one doctor | 200 |
| GET | `/tokens/:id` | One token | 200, 404 missing id, 400 invalid id |
| POST | `/tokens` | Give a new patient the next token number. Body: `{ "patientName": "Kavya", "doctor": "dental" }` | **201**, **400** if the patient name or doctor is missing or invalid |
| PATCH | `/tokens/:id/seen` | Mark a token as seen | 200, **404** missing id, 400 invalid id |

- `nextWaitingToken` is the lowest token number still waiting (first come, first served), or `null` when nobody is waiting.
- New patients always start as `waiting`. Token numbers keep counting up and are never reused.
- Marking a token as seen twice is harmless: it simply returns the token again.
- Every response is JSON, including errors: `{ "error": "doctor is required" }`.

### How the data is saved
- **Start-up:** `loadTokens()` reads `data/tokens.json` with `fs/promises`. It only reads and never writes. A missing file means an empty queue. If the file holds invalid JSON, the server prints a clear error and stops instead of overwriting it.
- **After every change** (POST and PATCH): the change is applied to a copy of the queue, written to a temporary file, and then renamed over `data/tokens.json`. Memory is updated only after the save succeeds, and a crash never leaves a half-written file.
- **One change at a time:** changes go through a small queue, so two patients registering at the same moment never get the same token number.

## Install and run

Requires **Node.js 22** or later.

```bash
git clone https://github.com/exelynt-learning-platform/node-js-rest-apis-st-final-128551-amar.git
cd node-js-rest-apis-st-final-128551-amar
npm install
node server.js
```

```
Clinic token queue API running at http://localhost:3000
Loaded 5 tokens from data/tokens.json
```

Use `PORT=4000 node server.js` to run on another port.

## Sample run

Starting from the sample data (Priya and Rahul already seen; Sneha, Arjun and Meera waiting):

```bash
$ curl "http://localhost:3000/tokens/stats"
{"waiting":3,"seen":2,"nextWaitingToken":3}

$ curl "http://localhost:3000/tokens?doctor=dental"
[{"id":2,"tokenNumber":2,"patientName":"Rahul","doctor":"dental","status":"seen"},{"id":4,"tokenNumber":4,"patientName":"Arjun","doctor":"dental","status":"waiting"}]

$ curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"patientName":"Kavya","doctor":"dental"}'
{"id":6,"tokenNumber":6,"patientName":"Kavya","doctor":"dental","status":"waiting"}      # 201

$ curl -X PATCH "http://localhost:3000/tokens/3/seen"
{"id":3,"tokenNumber":3,"patientName":"Sneha","doctor":"general","status":"seen"}

$ curl "http://localhost:3000/tokens/stats"
{"waiting":3,"seen":3,"nextWaitingToken":4}

$ curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"patientName":"Ravi"}'
{"error":"doctor is required"}      # 400

$ curl -X PATCH "http://localhost:3000/tokens/999/seen"
{"error":"Token with id 999 not found"}      # 404
```

The full recorded session, with every request, every response, and the restart check, is in [REVIEW.md](REVIEW.md).

## requests.sh

With the server running, open a second terminal (Git Bash on Windows, or any macOS/Linux terminal):

```bash
bash requests.sh
```

It runs a curl command for every route and prints each response with its status code. It really changes `data/tokens.json`; run `git checkout -- data/tokens.json` to get the sample data back.

## Tests

```bash
npm test
```

There are 18 automated tests using Node's built-in `node:test`, run against a temporary copy of the data so `data/tokens.json` is never touched. They check every route, the filters and stats against the sample data, every status code (200, 201, 400, 404), that changes survive a reload, that parallel registrations get unique token numbers, and that a missing or broken data file is handled safely.

## Files

| File | Purpose |
|---|---|
| `server.js` | The Express API and file storage |
| `data/tokens.json` | Sample queue with five tokens |
| `requests.sh` | A curl command for every route |
| `REVIEW.md` | Every request and its response, pasted as text |
| `test/server.test.js` | Automated tests |

## What I learned
- Designing REST routes for a real workflow: a filterable list, a summary (`/stats`) and a focused action (`PATCH /tokens/:id/seen`)
- Reading query-string filters with `req.query`, validating them, and declaring `/tokens/stats` before `/tokens/:id`
- Choosing status codes: **201** for created, **400** for invalid input, **404** for a missing id
- Saving data safely with `fs/promises`: read-only loading, a temp file plus rename, and one write at a time
- Testing an API with curl, a reusable `requests.sh` and automated `node:test` tests
