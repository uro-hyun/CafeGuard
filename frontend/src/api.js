async function request(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return null
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `요청 실패 (${res.status})`)
  return data
}

export const api = {
  createTag: (tag) => request('POST', '/api/tags', tag),
  updateTag: (tagId, patch) => request('PATCH', `/api/tags/${encodeURIComponent(tagId)}`, patch),
  deleteTag: (tagId) => request('DELETE', `/api/tags/${encodeURIComponent(tagId)}`),
  updateGate: (gateId, patch) => request('PATCH', `/api/gates/${encodeURIComponent(gateId)}`, patch),
  deleteGate: (gateId) => request('DELETE', `/api/gates/${encodeURIComponent(gateId)}`),
  testGate: (gateId) => request('POST', `/api/gates/${encodeURIComponent(gateId)}/test-alarm`, { seconds: 3 }),
  ackAlarm: (id) => request('POST', `/api/alarms/${encodeURIComponent(id)}/ack`),
  ackAll: () => request('POST', '/api/alarms/ack-all'),
  updateSettings: (patch) => request('PUT', '/api/settings', patch),
}
