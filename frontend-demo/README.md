# Member D — Frontend Demo

**Your job:** the face of the project. This is what recruiters and evaluators will actually click through — invest real effort in polish here, it pays off disproportionately for a resume/portfolio piece.

## Why this matters (in the architecture)
This is the client side of the "Verification Runtime" layer, plus the whole user-facing story. A working backend nobody can see is invisible to a recruiter; a slick demo is not.

## Stack
React + Vite (matches your existing frontend stack).

## Screens to build
1. **Input screen** — form for the user to enter their private data (matching Member A's model's input fields, e.g. income, loan amount, credit history for a loan model).
2. **Processing screen** — shows the pipeline running: "Running model... → Generating zero-knowledge proof... → Done" (poll `GET /api/prove/:proofId`).
3. **Result screen** — shows:
   - The model's output/decision
   - A "Proof Verified ✅" badge (from `/api/verify`)
   - Optional: link to the on-chain verification transaction (Week 9+)
   - A collapsible "What just happened?" explainer for non-technical viewers — this is a great touch for demos/interviews.
4. **About/How it works page** — a simple diagram (reuse the architecture diagram from the root README) explaining zkML in plain language. Great for judges/recruiters who land on the repo cold.

## Tasks
1. Scaffold with Vite, build screens 1–4 against **mocked** API responses matching the contract in `backend-api/README.md`.
2. Once Member C's real endpoints are up, swap mocks for real `fetch` calls.
3. Add loading/error states — don't let the UI hang silently while a proof is generating (proofs can take real time — communicate that to the user).
4. Polish pass in Week 10: consistent styling, responsive layout, empty/error states.
5. Deploy to Vercel/Netlify (free tier is fine).
6. Record a 2–3 min demo video walking through the flow — put the link in the root README. This single video often matters more than the code for shortlisting.

## Deliverables checklist
- [ ] 4 screens above, working against real backend
- [ ] Loading/error states
- [ ] Deployed live link
- [ ] Demo video
- [ ] "How it works" explainer content

## Design suggestion
Since this doubles as a portfolio piece, make it visually distinct — don't ship default Vite/Tailwind boilerplate styling. Even a simple, deliberate color/type choice reads as "designed" rather than "default."
