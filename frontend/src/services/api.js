// Runtime config is injected by docker-entrypoint-render.sh at container start.
// Falls back to Vite build-time env, then empty string (same-origin, for local dev).
const API_URL = window.__RUNTIME_CONFIG__?.API_URL || import.meta.env.VITE_API_URL || "";

export async function fetchModels() {
  const res = await fetch(`${API_URL}/api/models`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function submitProve(input) {
  const res = await fetch(`${API_URL}/api/prove`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input })
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
