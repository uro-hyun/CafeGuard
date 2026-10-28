const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { HttpError } = require('./services/monitor');
const { Event } = require('./models');

/**
 * Express 앱 생성. monitor를 주입받아 테스트에서도 그대로 쓸 수 있게 분리했다.
 */
function createApp({ monitor, config }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors({ origin: config.corsOrigin }));
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (req, res) => {
    res.json({ ok: true, db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' });
  });

  // ───── 게이트보드 → 서버 ─────
  const deviceAuth = (req, res, next) => {
    if (!config.deviceKey) return next();
    const got = Buffer.from(String(req.get('x-device-key') || ''));
    const want = Buffer.from(config.deviceKey);
    if (got.length === want.length && crypto.timingSafeEqual(got, want)) return next();
    return res.status(401).json({ ok: false, error: 'invalid device key' });
  };

  app.post('/api/device/report', deviceAuth, async (req, res) => {
    res.json(await monitor.handleReport(req.body));
  });

  // ───── 대시보드 → 서버 ─────
  app.get('/api/state', (req, res) => res.json(monitor.snapshot()));

  app.post('/api/tags', async (req, res) => res.status(201).json(await monitor.createTag(req.body)));
  app.patch('/api/tags/:tagId', async (req, res) => res.json(await monitor.updateTag(req.params.tagId, req.body || {})));
  app.delete('/api/tags/:tagId', async (req, res) => {
    await monitor.deleteTag(req.params.tagId);
    res.status(204).end();
  });

  app.patch('/api/gates/:gateId', async (req, res) => res.json(await monitor.updateGate(req.params.gateId, req.body || {})));
  app.delete('/api/gates/:gateId', async (req, res) => {
    await monitor.deleteGate(req.params.gateId);
    res.status(204).end();
  });
  app.post('/api/gates/:gateId/test-alarm', (req, res) => {
    monitor.testGateAlarm(req.params.gateId, req.body?.seconds);
    res.json({ ok: true });
  });

  app.post('/api/alarms/ack-all', async (req, res) => {
    await monitor.ackAll();
    res.json({ ok: true });
  });
  app.post('/api/alarms/:id/ack', async (req, res) => {
    await monitor.ackAlarm(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/events', async (req, res) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
    const filter = {};
    if (typeof req.query.tagId === 'string') filter.tagId = req.query.tagId;
    const events = await Event.find(filter).sort({ createdAt: -1 }).limit(limit).lean();
    res.json(events);
  });

  app.get('/api/settings', (req, res) => res.json(monitor.settings));
  app.put('/api/settings', async (req, res) => res.json(await monitor.updateSettings(req.body || {})));

  app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'not found' }));

  // 프론트엔드 빌드(frontend/dist)가 있으면 같은 포트에서 서빙 → 배포 시 서버 하나로 운영 가능
  const dist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^\/(?!api|socket\.io).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) => res.send('CafeGuard Backend Server is Running!'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof HttpError) return res.status(err.status).json({ ok: false, error: err.message });
    if (err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'invalid JSON' });
    if (err.name === 'CastError') return res.status(404).json({ ok: false, error: 'not found' });
    console.error(err);
    res.status(500).json({ ok: false, error: 'internal error' });
  });

  return app;
}

module.exports = { createApp };
