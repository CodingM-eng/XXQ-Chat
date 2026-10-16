import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireAdmin } from '../auth/index.js';
import { dataStore, isWhitelistModeEnabled } from '../db/index.js';
import { config } from '../config.js';

const router = Router();

// Apply auth and admin checks to all admin endpoints
router.use(requireAuth, requireAdmin);

// GET /api/admin/status
router.get('/status', async (req, res) => {
  const whitelistMode = await isWhitelistModeEnabled();
  const stats = await dataStore.getStats();

  res.json({
    whitelistMode,
    stats,
    initialAdminEmail: config.INITIAL_ADMIN_EMAIL,
  });
});

// POST /api/admin/whitelist/toggle
const toggleSchema = z.object({
  enabled: z.boolean(),
  confirmation: z.literal(true), // Explicit confirmation required
});

router.post('/whitelist/toggle', async (req, res) => {
  const parseResult = toggleSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', message: 'Beyaz liste modunu değiştirmek için onay gereklidir.' });
    return;
  }

  const { enabled } = parseResult.data;
  const user = req.user!;

  await dataStore.setWhitelistMode(enabled);

  const action = enabled ? 'WHITELIST_ENABLED' : 'WHITELIST_DISABLED';
  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action,
    target: 'SYSTEM',
    details: `Beyaz liste modu ${enabled ? 'ETKİNLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'} olarak güncellendi`,
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    whitelistMode: enabled,
    message: `Beyaz liste erişim kontrolü ${enabled ? 'ETKİNLEŞTİRİLDİ' : 'DEVRE DIŞI BIRAKILDI'}.`,
  });
});

// GET /api/admin/whitelist
router.get('/whitelist', async (req, res) => {
  const items = await dataStore.getWhitelist();
  res.json({ whitelist: items });
});

// POST /api/admin/whitelist/add
const addWhitelistSchema = z.object({
  email: z.string().email(),
});

router.post('/whitelist/add', async (req, res) => {
  const parseResult = addWhitelistSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_EMAIL', message: 'Geçerli bir e-posta adresi gereklidir.' });
    return;
  }

  const email = parseResult.data.email.toLowerCase().trim();
  const user = req.user!;

  try {
    await dataStore.addToWhitelist(email, user.email);

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'USER_WHITELIST_APPROVED',
      target: email,
      details: `${email} kullanıcısı için uygulama erişimi onaylandı`,
      ipAddress: req.ip,
    });

    res.json({ success: true, email, message: `${email} hesabı başarıyla onaylandı.` });
  } catch (err: any) {
    res.status(500).json({ error: 'DB_ERROR', message: err.message });
  }
});

// DELETE /api/admin/whitelist/:email
router.delete('/whitelist/:email', async (req, res) => {
  const email = req.params.email.toLowerCase().trim();
  const user = req.user!;

  // Prevent removing the bootstrap admin email
  if (email === config.INITIAL_ADMIN_EMAIL.toLowerCase().trim()) {
    res.status(400).json({ error: 'PROTECTED_ACCOUNT', message: 'Birincil sistem yöneticisi hesabı beyaz listeden kaldırılamaz.' });
    return;
  }

  const removed = await dataStore.removeFromWhitelist(email);

  if (!removed) {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Kullanıcı beyaz listede bulunamadı.' });
    return;
  }

  await dataStore.recordAuditLog({
    actorId: user.id,
    actorEmail: user.email,
    action: 'USER_WHITELIST_REVOKED',
    target: email,
    details: `${email} için beyaz liste onayı kaldırıldı`,
    ipAddress: req.ip,
  });

  res.json({ success: true, email, message: `${email} için beyaz liste onayı kaldırıldı.` });
});

// GET /api/admin/audit-logs
router.get('/audit-logs', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const logs = await dataStore.getAuditLogs(limit);
  res.json({
    auditLogs: logs.map((l) => ({
      id: l.id,
      actor_id: l.actorId,
      actorId: l.actorId,
      actor_email: l.actorEmail,
      actorEmail: l.actorEmail,
      action: l.action,
      target: l.target,
      details: l.details,
      ip_address: l.ipAddress,
      ipAddress: l.ipAddress,
      created_at: l.createdAt,
      createdAt: l.createdAt,
    })),
  });
});

// GET /api/admin/users
router.get('/users', async (req, res) => {
  const users = await dataStore.getAllUsers();
  res.json({ users });
});

export const adminRouter = router;
