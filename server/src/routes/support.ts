import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireModerator } from '../auth/index.js';
import { dataStore } from '../db/index.js';

const router = Router();

// Require valid authentication token.
// IMPORTANT: Whitelist enforcement is NOT applied to support reports, allowing pending or rejected users
// to submit support requests and appeal access decisions to platform administrators.
router.use(requireAuth);

const createReportSchema = z.object({
  title: z.string().min(3, 'Başlık en az 3 karakter olmalıdır.').max(150),
  description: z.string().min(5, 'Açıklama en az 5 karakter olmalıdır.').max(3000),
  diagnostics: z
    .object({
      appVersion: z.string().optional().default('1.0.0'),
      platform: z.string().optional().default('web'),
      userAgent: z.string().optional().default(''),
      currentPath: z.string().optional().default(''),
      errorCode: z.string().nullable().optional(),
    })
    .optional(),
});

// POST /api/support/reports - submit a problem report
router.post('/reports', async (req, res) => {
  const parseResult = createReportSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_INPUT', details: parseResult.error.format() });
    return;
  }

  const user = req.user!;
  const { title, description, diagnostics } = parseResult.data;

  // Sanitize diagnostics: never accept or store auth tokens, cookies, or secrets
  const sanitizedDiagnostics = {
    appVersion: diagnostics?.appVersion || '1.0.0',
    platform: diagnostics?.platform || 'web',
    userAgent: diagnostics?.userAgent || req.headers['user-agent'] || '',
    currentPath: diagnostics?.currentPath || '/',
    timestamp: new Date().toISOString(),
    errorCode: diagnostics?.errorCode || null,
  };

  try {
    const report = await dataStore.createSupportReport({
      userId: user.id,
      userEmail: user.email,
      userDisplayName: user.displayName || user.email,
      title: title.trim(),
      description: description.trim(),
      diagnostics: sanitizedDiagnostics,
    });

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'SUPPORT_REPORT_SUBMITTED',
      target: report.id,
      details: `Sorun bildirildi: "${report.title}"`,
      ipAddress: req.ip,
    });

    const { userEmail, ...safeReport } = report;

    res.status(201).json({
      success: true,
      report: safeReport,
      message: 'Sorun bildiriminiz başarıyla iletildi. İnceleme sonrası tarafınıza dönüş yapılacaktır.',
    });
  } catch (err: any) {
    console.error('Error submitting support report:', err);
    res.status(500).json({ error: 'REPORT_FAILED', message: 'Sorun bildirimi kaydedilirken bir hata oluştu.' });
  }
});

// GET /api/support/reports - list problem reports (Admin or Moderator only)
router.get('/reports', requireModerator, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const reports = await dataStore.getSupportReports(limit);
    // Explicitly omit email address from ordinary report listing; display only displayName and safe identifiers
    const sanitizedReports = reports.map((r) => {
      const { userEmail, ...safe } = r;
      return safe;
    });
    res.json({ reports: sanitizedReports });
  } catch (err: any) {
    res.status(500).json({ error: 'FETCH_FAILED', message: err.message });
  }
});

// PATCH /api/support/reports/:id - update report status (Admin or Moderator only)
const updateStatusSchema = z.object({
  status: z.enum(['open', 'investigating', 'resolved']),
});

router.patch('/reports/:id', requireModerator, async (req, res) => {
  const parseResult = updateStatusSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: 'INVALID_STATUS', details: parseResult.error.format() });
    return;
  }

  const id = req.params.id as string;
  const user = req.user!;
  const { status } = parseResult.data;

  try {
    const updated = await dataStore.updateSupportReportStatus(id, status);
    if (!updated) {
      res.status(404).json({ error: 'NOT_FOUND', message: 'Bildirim kaydı bulunamadı.' });
      return;
    }

    await dataStore.recordAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: 'SUPPORT_REPORT_STATUS_UPDATED',
      target: id,
      details: `Durum güncellendi: ${status}`,
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Bildirim durumu güncellendi.' });
  } catch (err: any) {
    res.status(500).json({ error: 'UPDATE_FAILED', message: err.message });
  }
});

export const supportRouter = router;
