# REVIEW: Clinic Token Queue API

A real session recorded with curl in Git Bash against `node server.js` on http://localhost:3000, starting from the sample `data/tokens.json` (tokens 1-2 seen, 3-5 waiting). Every response is pasted as text exactly as the API returned it, with its HTTP status code.

## 1. Start the server

```
$ node server.js
Clinic token queue API running at http://localhost:3000
Loaded 5 tokens from data\tokens.json
```

## 2. List and filter tokens

### GET /tokens: all tokens

```bash
curl "http://localhost:3000/tokens"
```

Response: **200**

```json
[
  {
    "id": 1,
    "tokenNumber": 1,
    "patientName": "Priya",
    "doctor": "general",
    "status": "seen"
  },
  {
    "id": 2,
    "tokenNumber": 2,
    "patientName": "Rahul",
    "doctor": "dental",
    "status": "seen"
  },
  {
    "id": 3,
    "tokenNumber": 3,
    "patientName": "Sneha",
    "doctor": "general",
    "status": "waiting"
  },
  {
    "id": 4,
    "tokenNumber": 4,
    "patientName": "Arjun",
    "doctor": "dental",
    "status": "waiting"
  },
  {
    "id": 5,
    "tokenNumber": 5,
    "patientName": "Meera",
    "doctor": "general",
    "status": "waiting"
  }
]
```

### GET /tokens?doctor=dental

```bash
curl "http://localhost:3000/tokens?doctor=dental"
```

Response: **200**

```json
[
  {
    "id": 2,
    "tokenNumber": 2,
    "patientName": "Rahul",
    "doctor": "dental",
    "status": "seen"
  },
  {
    "id": 4,
    "tokenNumber": 4,
    "patientName": "Arjun",
    "doctor": "dental",
    "status": "waiting"
  }
]
```

### GET /tokens?status=waiting

```bash
curl "http://localhost:3000/tokens?status=waiting"
```

Response: **200**

```json
[
  {
    "id": 3,
    "tokenNumber": 3,
    "patientName": "Sneha",
    "doctor": "general",
    "status": "waiting"
  },
  {
    "id": 4,
    "tokenNumber": 4,
    "patientName": "Arjun",
    "doctor": "dental",
    "status": "waiting"
  },
  {
    "id": 5,
    "tokenNumber": 5,
    "patientName": "Meera",
    "doctor": "general",
    "status": "waiting"
  }
]
```

### GET /tokens?doctor=general&status=waiting (both filters)

```bash
curl "http://localhost:3000/tokens?doctor=general&status=waiting"
```

Response: **200**

```json
[
  {
    "id": 3,
    "tokenNumber": 3,
    "patientName": "Sneha",
    "doctor": "general",
    "status": "waiting"
  },
  {
    "id": 5,
    "tokenNumber": 5,
    "patientName": "Meera",
    "doctor": "general",
    "status": "waiting"
  }
]
```

## 3. Stats

### GET /tokens/stats

```bash
curl "http://localhost:3000/tokens/stats"
```

Response: **200**

```json
{
  "waiting": 3,
  "seen": 2,
  "nextWaitingToken": 3
}
```

### GET /tokens/stats?doctor=dental

```bash
curl "http://localhost:3000/tokens/stats?doctor=dental"
```

Response: **200**

```json
{
  "waiting": 1,
  "seen": 1,
  "nextWaitingToken": 4
}
```

## 4. Add a walk-in patient

### POST /tokens (201)

```bash
curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"patientName":"Kavya","doctor":"dental"}'
```

Response: **201**

```json
{
  "id": 6,
  "tokenNumber": 6,
  "patientName": "Kavya",
  "doctor": "dental",
  "status": "waiting"
}
```

## 5. Mark a token as seen

### PATCH /tokens/3/seen

```bash
curl -X PATCH "http://localhost:3000/tokens/3/seen"
```

Response: **200**

```json
{
  "id": 3,
  "tokenNumber": 3,
  "patientName": "Sneha",
  "doctor": "general",
  "status": "seen"
}
```

### GET /tokens/stats after token 3 was seen (next waiting moves to 4)

```bash
curl "http://localhost:3000/tokens/stats"
```

Response: **200**

```json
{
  "waiting": 3,
  "seen": 3,
  "nextWaitingToken": 4
}
```

## 6. Error cases

### POST without a patient name (400)

```bash
curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"doctor":"general"}'
```

Response: **400**

```json
{
  "error": "patientName is required"
}
```

### POST without a doctor (400)

```bash
curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"patientName":"Ravi"}'
```

Response: **400**

```json
{
  "error": "doctor is required"
}
```

### POST with an unknown doctor (400)

```bash
curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"patientName":"Ravi","doctor":"eye"}'
```

Response: **400**

```json
{
  "error": "doctor must be one of: general, dental"
}
```

### POST with invalid JSON (400)

```bash
curl -X POST "http://localhost:3000/tokens" -H "Content-Type: application/json" -d '{"patientName": "Ravi"'
```

Response: **400**

```json
{
  "error": "Request body is not valid JSON"
}
```

### PATCH a missing id (404)

```bash
curl -X PATCH "http://localhost:3000/tokens/999/seen"
```

Response: **404**

```json
{
  "error": "Token with id 999 not found"
}
```

### PATCH an invalid id (400)

```bash
curl -X PATCH "http://localhost:3000/tokens/abc/seen"
```

Response: **400**

```json
{
  "error": "id must be a positive whole number"
}
```

### GET /tokens with an unknown filter value (400)

```bash
curl "http://localhost:3000/tokens?doctor=eye"
```

Response: **400**

```json
{
  "error": "doctor filter must be one of: general, dental"
}
```

### GET a missing token (404)

```bash
curl "http://localhost:3000/tokens/999"
```

Response: **404**

```json
{
  "error": "Token with id 999 not found"
}
```

## 7. Saved to the file: still there after a restart

Before the restart, `data/tokens.json` contains Kavya (token 6), and token 3 is `seen`:

```bash
$ cat data/tokens.json
[
  {
    "id": 1,
    "tokenNumber": 1,
    "patientName": "Priya",
    "doctor": "general",
    "status": "seen"
  },
  {
    "id": 2,
    "tokenNumber": 2,
    "patientName": "Rahul",
    "doctor": "dental",
    "status": "seen"
  },
  {
    "id": 3,
    "tokenNumber": 3,
    "patientName": "Sneha",
    "doctor": "general",
    "status": "seen"
  },
  {
    "id": 4,
    "tokenNumber": 4,
    "patientName": "Arjun",
    "doctor": "dental",
    "status": "waiting"
  },
  {
    "id": 5,
    "tokenNumber": 5,
    "patientName": "Meera",
    "doctor": "general",
    "status": "waiting"
  },
  {
    "id": 6,
    "tokenNumber": 6,
    "patientName": "Kavya",
    "doctor": "dental",
    "status": "waiting"
  }
]
```

The server process was stopped and started again:

```
$ node server.js
Clinic token queue API running at http://localhost:3000
Loaded 6 tokens from data\tokens.json
```

### GET /tokens/6 after the restart

```bash
curl "http://localhost:3000/tokens/6"
```

Response: **200**

```json
{
  "id": 6,
  "tokenNumber": 6,
  "patientName": "Kavya",
  "doctor": "dental",
  "status": "waiting"
}
```

### GET /tokens/stats after the restart

```bash
curl "http://localhost:3000/tokens/stats"
```

Response: **200**

```json
{
  "waiting": 3,
  "seen": 3,
  "nextWaitingToken": 4
}
```

The server loaded 6 tokens instead of 5, Kavya's token 6 is still there, and the stats still count token 3 as seen. Everything was read back from `data/tokens.json`.

## 8. Running requests.sh

```
$ bash requests.sh
1. GET /tokens - list all tokens
[{"id":1,"tokenNumber":1,"patientName":"Priya","doctor":"general","status":"seen"},{"id":2,"tokenNumber":2,"patientName":"Rahul","doctor":"dental","status":"seen"},{"id":3,"tokenNumber":3,"patientName":"Sneha","doctor":"general","status":"seen"},{"id":4,"tokenNumber":4,"patientName":"Arjun","doctor":"dental","status":"waiting"},{"id":5,"tokenNumber":5,"patientName":"Meera","doctor":"general","status":"waiting"},{"id":6,"tokenNumber":6,"patientName":"Kavya","doctor":"dental","status":"waiting"}]
Status: 200

2. GET /tokens?doctor=dental - filter by doctor
[{"id":2,"tokenNumber":2,"patientName":"Rahul","doctor":"dental","status":"seen"},{"id":4,"tokenNumber":4,"patientName":"Arjun","doctor":"dental","status":"waiting"},{"id":6,"tokenNumber":6,"patientName":"Kavya","doctor":"dental","status":"waiting"}]
Status: 200

3. GET /tokens?status=waiting - filter by status
[{"id":4,"tokenNumber":4,"patientName":"Arjun","doctor":"dental","status":"waiting"},{"id":5,"tokenNumber":5,"patientName":"Meera","doctor":"general","status":"waiting"},{"id":6,"tokenNumber":6,"patientName":"Kavya","doctor":"dental","status":"waiting"}]
Status: 200

4. GET /tokens/stats - waiting, seen and next waiting token
{"waiting":3,"seen":3,"nextWaitingToken":4}
Status: 200

5. GET /tokens/3 - one token
{"id":3,"tokenNumber":3,"patientName":"Sneha","doctor":"general","status":"seen"}
Status: 200

6. POST /tokens - new walk-in patient (201)
{"id":7,"tokenNumber":7,"patientName":"Kavya","doctor":"dental","status":"waiting"}
Status: 201

7. POST /tokens without a doctor (400)
{"error":"doctor is required"}
Status: 400

8. PATCH /tokens/3/seen - mark token 3 as seen
{"id":3,"tokenNumber":3,"patientName":"Sneha","doctor":"general","status":"seen"}
Status: 200

9. PATCH /tokens/999/seen - missing id (404)
{"error":"Token with id 999 not found"}
Status: 404

```

## 9. After recording

`data/tokens.json` was reset to the five sample tokens (`git checkout -- data/tokens.json`), so a fresh clone starts from the same data used at the top of this file.
