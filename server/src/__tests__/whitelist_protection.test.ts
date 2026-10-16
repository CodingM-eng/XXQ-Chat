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
    const unapprovedEmail = 'stranger@external.org';

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
});
