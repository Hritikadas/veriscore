# API Contract (read this before writing any code)

This document is an **agreement**, not code. It says exactly what goes in and out of each part of the system, so all 4 of us can build our own pieces at the same time without waiting on each other.

**Rule: nobody changes this file alone.** If you need to change a shape below, message the group first — everyone else's code depends on it staying stable.

---

## How to read this doc

For each endpoint you'll see:
- **What it's for** — in plain English
- **What you send** — the exact JSON
- **What you get back** — the exact JSON
- **Fake version to build against now** — literally what to hardcode so you can start today

---

## 1. `POST /api/predict`

**What it's for:** send the model your input data, get back its decision.

**What you send:**
```json
{
  "input": [25000, 700, 3]
}
```
> `input` is an array of numbers. For our loan demo: `[income, credit_score, years_employed]`. Member A and Member C must agree on the exact order/meaning of these numbers — write it here once decided.

**What you get back:**
```json
{
  "output": "approved",
  "modelVersion": "v1"
}
```
> `output` is the decision. `modelVersion` just helps us track which model made the call.

**Fake version to build against now:**
```js
// Member C, before the real model is ready:
app.post('/api/predict', (req, res) => {
  res.json({ output: "approved", modelVersion: "v1-mock" });
});
```
```js
// Member D, before the real backend is ready:
const fakePredict = async (input) => ({ output: "approved", modelVersion: "v1-mock" });
```

---

## 2. `POST /api/prove`

**What it's for:** ask the system to generate a zero-knowledge proof for a given input. This takes real time (seconds to minutes), so it doesn't return the proof right away — it returns an ID you can check on later, like a food order ticket number.

**What you send:**
```json
{
  "input": [25000, 700, 3]
}
```

**What you get back immediately:**
```json
{
  "proofId": "abc123",
  "status": "generating"
}
```

**Fake version to build against now:**
```js
app.post('/api/prove', (req, res) => {
  res.json({ proofId: "fake-" + Date.now(), status: "generating" });
});
```

---

## 3. `GET /api/prove/:proofId`

**What it's for:** check on that "order ticket" — is the proof ready yet?

**What you get back (while still working):**
```json
{
  "status": "generating"
}
```

**What you get back (once done):**
```json
{
  "status": "done",
  "proof": { "...": "..." },
  "publicSignals": [1]
}
```
> Don't worry about what's actually inside `proof` yet — that's Member B's internal data. Everyone else just needs to know: it's an object, treat it as a black box, pass it along untouched.

**Fake version to build against now:**
```js
app.get('/api/prove/:proofId', (req, res) => {
  res.json({ status: "done", proof: { fake: true }, publicSignals: [1] });
});
```
```js
// Member D — simulate the "wait" with a timer so the UI has something to show:
setTimeout(() => setStatus("done"), 3000);
```

---

## 4. `POST /api/verify`

**What it's for:** check whether a given proof is actually valid.

**What you send:**
```json
{
  "proofId": "abc123"
}
```

**What you get back:**
```json
{
  "verified": true
}
```

**Fake version to build against now:**
```js
app.post('/api/verify', (req, res) => {
  res.json({ verified: true });
});
```

---

## 5. `POST /api/verify-onchain` (only needed from Week 9 onward — ignore for now)

**What you send:**
```json
{
  "proofId": "abc123"
}
```

**What you get back:**
```json
{
  "verified": true,
  "txHash": "0xabc...",
  "explorerUrl": "https://sepolia.etherscan.io/tx/0xabc..."
}
```

---

## What this unlocks for each of you, starting today

| You | Build this now, using the fakes above | Don't wait for |
|---|---|---|
| **Member A** | Train your model — just make sure its final input/output matches the `input`/`output` shape above | Anyone |
| **Member B** | Build your proving pipeline against ezkl's own sample models | Member A's finished model |
| **Member C** | Build all 4 real Express routes above, returning the fake/hardcoded JSON shown | Member B's finished proving service |
| **Member D** | Build all 4 screens calling these exact endpoints, using the fake responses shown | Member C's finished backend |

Later, in Weeks 3–6, each fake gets swapped for the real thing, one at a time — but nobody has to sit idle waiting for that to happen.

---

## If something needs to change

Post in the group chat: *"I need to change `/api/predict` — instead of `input` being an array, I need X because Y."* Get a thumbs-up from whoever's code depends on it before changing this file.