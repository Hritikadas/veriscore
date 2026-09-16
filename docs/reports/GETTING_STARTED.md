# Getting Started (Beginner-Friendly)

## 1. One person creates the GitHub repo

1. Go to github.com → New repository → name it (e.g. `zkml-verify`) → Public → add this README → Create.
2. Push this project scaffold:
   ```bash
   git init
   git add .
   git commit -m "Initial project scaffold"
   git branch -M main
   git remote add origin https://github.com/<your-username>/zkml-verify.git
   git push -u origin main
   ```

## 2. Add your 3 teammates as collaborators

Repo → Settings → Collaborators → Add people → enter their GitHub usernames. They'll get an email invite.

## 3. Everyone clones the repo

```bash
git clone https://github.com/<your-username>/zkml-verify.git
cd zkml-verify
```

## 4. Branching rule (keep it simple)

**Never push directly to `main`.** Each person works on their own branch, in their own folder:

```bash
git checkout -b feature/model-pipeline      # Member A
git checkout -b feature/zk-proving-service  # Member B
git checkout -b feature/backend-api         # Member C
git checkout -b feature/frontend-demo       # Member D
```

Daily workflow:
```bash
git add .
git commit -m "short description of what you did"
git push origin <your-branch-name>
```

Then open a **Pull Request** on GitHub into `main`, and have one teammate review/approve before merging. This gives you a clean commit history — a real plus when recruiters check your GitHub.

## 5. Avoid stepping on each other

Because each member owns a separate top-level folder, merge conflicts should be rare. The only shared files are `README.md` and things in `/docs` — coordinate in your group chat before editing those.

## 6. Weekly sync

Add a short entry to `docs/PROGRESS_LOG.md` every week (what you finished, what's blocked, what's next). This becomes evidence of teamwork for your project report/viva.
