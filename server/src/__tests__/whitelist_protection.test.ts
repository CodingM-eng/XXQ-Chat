import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import http from 'http';
import { io as ClientSocket, Socket as ClientSocketType } from 'socket.io-client';
import { app } from '../app.js';
import { setupSocketServer } from '../sockets/index.js';
import { dataStore, initDb, closeDb } from '../db/index.js';
import { generateDevToken } from '../auth/index.js';
import { config } from '../config.js';

describe('XXQ Chat Whitelist Gatekeeper & Profile Onboarding Suite', () => {
  let server: http.Server;
  let serverUrl: string;

  const adminEmail = config.INITIAL_ADMIN_EMAIL.toLowerCase().trim();
  const adminUser = {
    id: 'user_admin_test',
    email: adminEmail,
    displayName: 'Admin User',
    isAdmin: true,
  };
  let adminToken: string;

  beforeAll(async () => {
    await initDb();
    await dataStore.setWhitelistMode(true); // Whitelist ON

    adminToken = generateDevToken(adminUser);

    server = http.createServer(app);
    setupSocketServer(server);

    await new Promise<void>((resolve) => {
      server.listen(0, () => {
        const address = server.address() as any;
        serverUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await closeDb();
  });

  it('denies unapproved accounts before creating active user profiles when whitelist is ON', async () => {
    const unapprovedEmail = 'stranger_' + Date.now() + '@external.org';

    // Attempt sign-in with unapproved account
    const loginRes = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: unapprovedEmail, displayName: 'Stranger One' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.whitelist.modeActive).toBe(true);
    expect(loginRes.body.whitelist.isApproved).toBe(false);
    expect(loginRes.body.whitelist.canAccessApp).toBe(false);

    // CRITICAL: Must NOT have created an active profile in users table/collection
    const userInDb = await dataStore.getUserByEmail(unapprovedEmail);
    expect(userInDb).toBeNull();

    // CRITICAL: Must NOT appear in user directory search
    const directoryRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(directoryRes.status).toBe(200);
    const inDirectory = directoryRes.body.users.some((u: any) => u.email === unapprovedEmail);
    expect(inDirectory).toBe(false);

    // CRITICAL: Request protected endpoints with unapproved token must be blocked with 403
    const strangerToken = loginRes.body.token;
    const accessRes = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${strangerToken}`);
    expect(accessRes.status).toBe(403);
    expect(accessRes.body.error).toBe('ACCESS_DENIED_NOT_WHITELISTED');

    // Verify pending attempt was recorded and visible to administrator
    const pendingRes = await request(app)
      .get('/api/admin/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(pendingRes.status).toBe(200);
    const pendingEntry = pendingRes.body.pendingRequests.find((p: any) => p.email === unapprovedEmail);
    expect(pendingEntry).toBeDefined();
    expect(pendingEntry.status).toBe('pending');
  });

  it('promotes user to onboarding and active directory once approved by administrator', async () => {
    const newUserEmail = 'approved.candidate@company.com';

    // 1. Initial attempt while unapproved
    const initialLogin = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: newUserEmail, displayName: 'Candidate User' });
    const userToken = initialLogin.body.token;

    // 2. Admin approves the pending candidate
    const approveRes = await request(app)
      .post('/api/admin/whitelist/approve')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: newUserEmail });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);

    // 3. User checks session: now approved!
    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${userToken}`);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.whitelist.isApproved).toBe(true);
    expect(sessionRes.body.whitelist.canAccessApp).toBe(true);

    // 4. User completes profile onboarding
    const onboardingRes = await request(app)
      .post('/api/users/onboarding')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        firstName: 'Ali',
        lastName: 'Yılmaz',
        displayName: 'Ali Yılmaz',
        phoneNumber: '+905551234567',
      });
    expect(onboardingRes.status).toBe(200);
    expect(onboardingRes.body.user.onboarded).toBe(true);
    expect(onboardingRes.body.user.displayName).toBe('Ali Yılmaz');

    // 5. Now the user is active in directory, but phone number is strictly private
    const directoryRes = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${adminToken}`);
    const foundUser = directoryRes.body.users.find((u: any) => u.email === newUserEmail);
    expect(foundUser).toBeDefined();
    expect(foundUser.displayName).toBe('Ali Yılmaz');
    expect(foundUser.phoneNumber).toBeUndefined(); // Never leaked!
  });

  it('disconnects active Socket.IO connection in real-time when access is revoked', async () => {
    const revokingEmail = 'revokeme@company.com';

    // Approve first
    await request(app)
      .post('/api/admin/whitelist/add')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: revokingEmail });

    const loginRes = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: revokingEmail, displayName: 'Revoke Target' });
    const token = loginRes.body.token;

    // Connect socket
    const socket: ClientSocketType = ClientSocket(serverUrl, { auth: { token } });
    await new Promise<void>((resolve) => socket.on('connect', () => resolve()));
    expect(socket.connected).toBe(true);

    let revokedNotified = false;
    socket.on('auth:revoked', () => {
      revokedNotified = true;
    });

    // Admin revokes access
    const deleteRes = await request(app)
      .delete(`/api/admin/whitelist/${revokingEmail}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(deleteRes.status).toBe(200);

    // Wait for real-time revocation and socket disconnect
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(revokedNotified).toBe(true);
    expect(socket.connected).toBe(false);
  });

  it('persists rejection status across repeated sign-ins and blocks access with ACCESS_DENIED_REJECTED', async () => {
    const candidateEmail = 'candidate_reject_' + Date.now() + '@external.org';

    // 1. Initial attempt creates pending request
    const initRes = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: candidateEmail, displayName: 'Candidate To Reject' });
    expect(initRes.status).toBe(200);
    expect(initRes.body.whitelist.status).toBe('pending');

    // 2. Admin rejects the applicant
    const rejectRes = await request(app)
      .post('/api/admin/whitelist/reject')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: candidateEmail });
    expect(rejectRes.status).toBe(200);
    expect(rejectRes.body.success).toBe(true);

    // 3. Candidate attempts sign-in again: status must remain 'rejected' (NOT reset to pending!)
    const secondLogin = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: candidateEmail, displayName: 'Candidate To Reject' });
    expect(secondLogin.status).toBe(200);
    expect(secondLogin.body.user.status).toBe('rejected');
    expect(secondLogin.body.whitelist.status).toBe('rejected');
    expect(secondLogin.body.whitelist.isApproved).toBe(false);

    // 4. Checking session returns rejected status
    const candidateToken = secondLogin.body.token;
    const sessionRes = await request(app)
      .get('/api/auth/session')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(sessionRes.status).toBe(200);
    expect(sessionRes.body.user.status).toBe('rejected');
    expect(sessionRes.body.whitelist.status).toBe('rejected');

    // 5. Attempting to access protected endpoints returns 403 ACCESS_DENIED_REJECTED
    const accessRes = await request(app)
      .get('/api/conversations')
      .set('Authorization', `Bearer ${candidateToken}`);
    expect(accessRes.status).toBe(403);
    expect(accessRes.body.error).toBe('ACCESS_DENIED_REJECTED');
  });

  it('allows pending and rejected users to submit support messages without exposing email', async () => {
    const applicantEmail = 'applicant.help@external.org';

    const loginRes = await request(app)
      .post('/api/auth/dev-login')
      .send({ email: applicantEmail, displayName: 'Yardım İsteyen Aday' });
    const userToken = loginRes.body.token;

    // Applicant submits a support report
    const submitRes = await request(app)
      .post('/api/support/reports')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Erişim onay süreci',
        description: 'Merhaba, şirket içi iletişim için erişim talebinde bulundum. İncelenmesini rica ederim.',
      });
    expect(submitRes.status).toBe(201);
    expect(submitRes.body.success).toBe(true);
    expect(submitRes.body.report).toBeDefined();
    expect(submitRes.body.report.id).toBeDefined();

    // Applicant cannot view all reports (requires moderator/admin)
    const unauthorizedListRes = await request(app)
      .get('/api/support/reports')
      .set('Authorization', `Bearer ${userToken}`);
    expect(unauthorizedListRes.status).toBe(403);

    // Moderator or Admin can view reports
    const adminReportsRes = await request(app)
      .get('/api/support/reports')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminReportsRes.status).toBe(200);
    const createdReport = adminReportsRes.body.reports.find((r: any) => r.id === submitRes.body.report.id);
    expect(createdReport).toBeDefined();
    expect(createdReport.userDisplayName).toBe('Yardım İsteyen Aday');
    expect((createdReport as any).userEmail).toBeUndefined();
  });

  it('allows authorized moderators to review whitelist requests and records correct reviewerRole in audit logs', async () => {
    const modEmail = 'moderator@xxqchat.com';
    await dataStore.addToWhitelist(modEmail, adminEmail);
    await dataStore.upsertUser({
      id: 'usr_mod_1',
      email: modEmail,
      displayName: 'Yetkili Moderatör',
      isAdmin: false,
      isModerator: true,
      status: 'active',
      onboarded: true,
    });

    const modToken = generateDevToken({
      id: 'usr_mod_1',
      email: modEmail,
      displayName: 'Yetkili Moderatör',
      isAdmin: false,
      isModerator: true,
    });

    const targetEmail = 'mod.approved@external.org';
    // User tries to sign in
    await request(app)
      .post('/api/auth/dev-login')
      .send({ email: targetEmail, displayName: 'Mod Onayı Hedefi' });

    // Moderator can access pending list
    const pendingRes = await request(app)
      .get('/api/admin/pending')
      .set('Authorization', `Bearer ${modToken}`);
    expect(pendingRes.status).toBe(200);

    // Moderator approves the user
    const approveRes = await request(app)
      .post('/api/admin/whitelist/approve')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ email: targetEmail });
    expect(approveRes.status).toBe(200);
    expect(approveRes.body.success).toBe(true);

    // Moderator cannot access platform-admin exclusive routes like toggle whitelist
    const toggleRes = await request(app)
      .post('/api/admin/whitelist/toggle')
      .set('Authorization', `Bearer ${modToken}`)
      .send({ enabled: false, confirmation: true });
    expect(toggleRes.status).toBe(403);

    // Audit logs should record the reviewer role as Moderatör
    const auditRes = await request(app)
      .get('/api/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(auditRes.status).toBe(200);
    const modLog = auditRes.body.auditLogs.find(
      (l: any) => l.target === targetEmail && l.action === 'USER_WHITELIST_APPROVED'
    );
    expect(modLog).toBeDefined();
    expect(modLog.details).toContain('Moderatör');
  });
});
