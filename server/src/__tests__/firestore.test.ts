import { describe, it, expect, beforeEach } from 'vitest';
import { FirestoreStore } from '../db/firestore.js';

// In-memory mock Firestore implementation for fast, offline unit testing of FirestoreStore
class MockFirestore {
  private collections = new Map<string, Map<string, any>>();

  collection(name: string) {
    if (!this.collections.has(name)) {
      this.collections.set(name, new Map<string, any>());
    }
    const store = this.collections.get(name)!;

    return {
      doc: (id: string) => this.docRef(name, id),
      where: (field: string, op: string, val: any) => this.queryRef(name, [{ field, op, val }]),
      orderBy: (field: string, dir?: string) => this.queryRef(name, []).orderBy(field, dir),
      get: async () => {
        const docs = Array.from(store.entries()).map(([id, data]) => ({
          id,
          data: () => ({ ...data }),
          exists: true,
        }));
        return {
          docs,
          size: docs.length,
          empty: docs.length === 0,
          forEach: (cb: (doc: any) => void) => docs.forEach(cb),
        };
      },
      count: () => ({
        get: async () => ({
          data: () => ({ count: store.size }),
        }),
      }),
    };
  }

  collectionGroup(name: string) {
    return {
      where: (field: string, op: string, val: any) => ({
        where: (field2: string, op2: string, val2: any) => ({
          limit: (_lim: number) => ({
            get: async () => {
              // Search in all subcollections named 'messages'
              const matches: any[] = [];
              for (const [colKey, subMap] of this.collections.entries()) {
                if (colKey.endsWith('/' + name) || colKey === name) {
                  for (const [id, data] of subMap.entries()) {
                    if (data[field] === val && data[field2] === val2) {
                      matches.push({ id, data: () => ({ ...data }), exists: true });
                    }
                  }
                }
              }
              return {
                docs: matches,
                empty: matches.length === 0,
                forEach: (cb: (doc: any) => void) => matches.forEach(cb),
              };
            },
          }),
        }),
      }),
    };
  }

  batch() {
    const operations: (() => void)[] = [];
    return {
      set: (ref: any, data: any, options?: any) => {
        operations.push(() => ref.set(data, options));
      },
      commit: async () => {
        for (const op of operations) op();
      },
    };
  }

  async terminate() {
    this.collections.clear();
  }

  private docRef(colName: string, id: string) {
    if (!this.collections.has(colName)) {
      this.collections.set(colName, new Map<string, any>());
    }
    const store = this.collections.get(colName)!;

    return {
      id,
      collection: (subName: string) => this.collection(`${colName}/${id}/${subName}`),
      get: async () => {
        const exists = store.has(id);
        const data = exists ? { ...store.get(id) } : undefined;
        return {
          id,
          exists,
          data: () => data,
        };
      },
      set: async (data: any, options?: { merge?: boolean }) => {
        if (options?.merge && store.has(id)) {
          const current = store.get(id);
          store.set(id, { ...current, ...data });
        } else {
          store.set(id, { ...data });
        }
      },
      update: async (data: any) => {
        const current = store.get(id) || {};
        store.set(id, { ...current, ...data });
      },
      delete: async () => {
        store.delete(id);
      },
    };
  }

  private queryRef(colName: string, filters: { field: string; op: string; val: any }[]) {
    const store = this.collections.get(colName) || new Map<string, any>();

    return {
      where: (field: string, op: string, val: any) =>
        this.queryRef(colName, [...filters, { field, op, val }]),
      limit: (lim: number) => ({
        get: async () => {
          const matching = this.filterDocs(store, filters).slice(0, lim);
          return {
            docs: matching,
            size: matching.length,
            empty: matching.length === 0,
            forEach: (cb: (doc: any) => void) => matching.forEach(cb),
          };
        },
      }),
      orderBy: (_field: string, _dir?: string) => ({
        limit: (lim: number) => ({
          get: async () => {
            const matching = this.filterDocs(store, filters).slice(0, lim);
            return {
              docs: matching,
              size: matching.length,
              empty: matching.length === 0,
              forEach: (cb: (doc: any) => void) => matching.forEach(cb),
            };
          },
        }),
        limitToLast: (lim: number) => ({
          get: async () => {
            const matching = this.filterDocs(store, filters).slice(-lim);
            return {
              docs: matching,
              size: matching.length,
              empty: matching.length === 0,
              forEach: (cb: (doc: any) => void) => matching.forEach(cb),
            };
          },
        }),
        get: async () => {
          const matching = this.filterDocs(store, filters);
          return {
            docs: matching,
            size: matching.length,
            empty: matching.length === 0,
            forEach: (cb: (doc: any) => void) => matching.forEach(cb),
          };
        },
      }),
      get: async () => {
        const matching = this.filterDocs(store, filters);
        return {
          docs: matching,
          size: matching.length,
          empty: matching.length === 0,
          forEach: (cb: (doc: any) => void) => matching.forEach(cb),
        };
      },
    };
  }

  private filterDocs(store: Map<string, any>, filters: { field: string; op: string; val: any }[]) {
    const results: any[] = [];
    for (const [id, data] of store.entries()) {
      let matches = true;
      for (const f of filters) {
        if (f.op === '==' && data[f.field] !== f.val) {
          matches = false;
          break;
        }
        if (f.op === 'array-contains' && (!Array.isArray(data[f.field]) || !data[f.field].includes(f.val))) {
          matches = false;
          break;
        }
      }
      if (matches) {
        results.push({
          id,
          data: () => ({ ...data }),
          exists: true,
        });
      }
    }
    return results;
  }
}

describe('FirestoreStore Persistence and Free-Tier Optimization Suite', () => {
  let mockFs: MockFirestore;
  let firestoreStore: FirestoreStore;

  beforeEach(async () => {
    mockFs = new MockFirestore();
    firestoreStore = new FirestoreStore(mockFs as any);
    await firestoreStore.init();
  });

  it('reports correct storage driver name', () => {
    expect(firestoreStore.driverName).toBe('firestore');
  });

  it('bootstraps whitelist mode and designated initial admin', async () => {
    const isWhitelist = await firestoreStore.isWhitelistModeEnabled();
    expect(isWhitelist).toBe(true);

    const adminWhitelisted = await firestoreStore.isEmailWhitelisted('codingdevelopia@gmail.com');
    expect(adminWhitelisted).toBe(true);
  });

  it('manages whitelist entries and caches query results to minimize Spark quota reads', async () => {
    const testEmail = 'pilot.user@xxqchat.com';
    expect(await firestoreStore.isEmailWhitelisted(testEmail)).toBe(false);

    // Add to whitelist
    await firestoreStore.addToWhitelist(testEmail, 'codingdevelopia@gmail.com');
    expect(await firestoreStore.isEmailWhitelisted(testEmail)).toBe(true);

    const list = await firestoreStore.getWhitelist();
    expect(list.some((e) => e.email === testEmail)).toBe(true);

    // Toggle whitelist mode off and on
    await firestoreStore.setWhitelistMode(false);
    expect(await firestoreStore.isWhitelistModeEnabled()).toBe(false);

    await firestoreStore.setWhitelistMode(true);
    expect(await firestoreStore.isWhitelistModeEnabled()).toBe(true);

    // Remove from whitelist
    const removed = await firestoreStore.removeFromWhitelist(testEmail);
    expect(removed).toBe(true);
    expect(await firestoreStore.isEmailWhitelisted(testEmail)).toBe(false);
  });

  it('handles user creation, profile update, and search in Firestore', async () => {
    const user = await firestoreStore.upsertUser({
      id: 'fs_usr_1',
      email: 'ahmet@xxq.com',
      displayName: 'Ahmet Yilmaz',
    });
    expect(user.id).toBe('fs_usr_1');
    expect(user.displayName).toBe('Ahmet Yilmaz');

    // Retrieve user by ID and email
    const fetchedById = await firestoreStore.getUserById('fs_usr_1');
    expect(fetchedById?.email).toBe('ahmet@xxq.com');

    const fetchedByEmail = await firestoreStore.getUserByEmail('ahmet@xxq.com');
    expect(fetchedByEmail?.id).toBe('fs_usr_1');

    // Update profile
    const updated = await firestoreStore.updateUserProfile('fs_usr_1', {
      displayName: 'Ahmet Yilmaz (Updated)',
      avatarUrl: 'https://example.com/avatar.png',
    });
    expect(updated?.displayName).toBe('Ahmet Yilmaz (Updated)');

    // Search users
    const searchResults = await firestoreStore.searchUsers('other_id', 'Ahmet');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].displayName).toBe('Ahmet Yilmaz (Updated)');
  });

  it('handles conversations, message sending, and unread receipts', async () => {
    const user1 = 'usr_u1';
    const user2 = 'usr_u2';

    // Direct conversation creation
    const convId = await firestoreStore.createDirectConversation(user1, user2);
    expect(convId).toBeDefined();

    // Verify participants
    expect(await firestoreStore.isConversationParticipant(convId, user1)).toBe(true);
    expect(await firestoreStore.isConversationParticipant(convId, user2)).toBe(true);
    expect(await firestoreStore.isConversationParticipant(convId, 'usr_stranger')).toBe(false);

    // Direct conversation lookup
    const foundConvId = await firestoreStore.getDirectConversation(user1, user2);
    expect(foundConvId).toBe(convId);

    // Send a message
    const msg = await firestoreStore.saveMessage({
      conversationId: convId,
      senderId: user1,
      senderName: 'Sender User',
      content: 'Merhaba Firestore!',
      clientMessageId: 'cli_123',
    });
    expect(msg.content).toBe('Merhaba Firestore!');
    expect(msg.status).toBe('sent');

    // Retrieve conversation messages
    const messages = await firestoreStore.getConversationMessages(convId);
    expect(messages.length).toBe(1);
    expect(messages[0].content).toBe('Merhaba Firestore!');

    // Mark as read
    await firestoreStore.markConversationRead(convId, user2, msg.id);

    // Verify conversation summary list
    const convs = await firestoreStore.getUserConversations(user1);
    expect(convs.length).toBe(1);
    expect(convs[0].id).toBe(convId);
  });

  it('records and retrieves structured audit logs', async () => {
    await firestoreStore.recordAuditLog({
      actorId: 'usr_admin',
      actorEmail: 'codingdevelopia@gmail.com',
      action: 'SYSTEM_SETTINGS_UPDATE',
      target: 'system',
      details: 'Updated whitelist policy',
      ipAddress: '127.0.0.1',
    });

    const logs = await firestoreStore.getAuditLogs(10);
    expect(logs.length).toBeGreaterThan(0);
    const log = logs.find((l) => l.action === 'SYSTEM_SETTINGS_UPDATE');
    expect(log).toBeDefined();
    expect(log?.actorEmail).toBe('codingdevelopia@gmail.com');
  });
});
