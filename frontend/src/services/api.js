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

export async function fetchRecentProofs() {
  const res = await fetch(`${API_URL}/api/trust-lab/recent-proofs`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

export async function verifyProof(proofId) {
  const res = await fetch(`${API_URL}/api/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proofId })
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function runTamperTest(proofId, tamperType = "original", customPayload = null) {
  const res = await fetch(`${API_URL}/api/trust-lab/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ proofId, tamperType, customPayload })
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export async function fetchReceiptJson(proofId, options = {}) {
  const params = new URLSearchParams({ format: "json" });
  if (options.decision) params.set("decision", options.decision);
  if (options.probability !== undefined) params.set("probability", String(options.probability));
  if (options.modelVersion) params.set("modelVersion", options.modelVersion);

  const res = await fetch(`${API_URL}/api/receipt/${proofId}?${params.toString()}`);
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export function getReceiptPdfUrl(proofId, options = {}) {
  const params = new URLSearchParams({ format: "pdf" });
  if (options.decision) params.set("decision", options.decision);
  if (options.probability !== undefined) params.set("probability", String(options.probability));
  if (options.modelVersion) params.set("modelVersion", options.modelVersion);

  return `${API_URL}/api/receipt/${proofId}?${params.toString()}`;
}
