// 백엔드 API 호출 모음. 개발 중에는 vite 프록시가 /api 를 백엔드로 넘긴다.
const BASE = import.meta.env.VITE_API_URL ?? "";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `요청 실패 (${res.status})`);
  return body;
}

export const getStatus = () => request("/status");
export const getEvents = (limit = 30) => request(`/alert?limit=${limit}`);
export const getConfig = (gateId) => request(`/config/${encodeURIComponent(gateId)}`);
export const saveConfig = (gateId, values) =>
  request(`/config/${encodeURIComponent(gateId)}`, { method: "PUT", body: JSON.stringify(values) });
export const saveTagLabel = (tagId, label) =>
  request(`/tags/${encodeURIComponent(tagId)}`, { method: "PUT", body: JSON.stringify({ label }) });
