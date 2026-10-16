import http from 'http';
import { app } from './app.js';
import { config } from './config.js';
import { setupSocketServer } from './sockets/index.js';
import { dataStore, initDb, closeDb } from './db/index.js';

const server = http.createServer(app);

// Attach Socket.IO
setupSocketServer(server);

// Ensure database is initialized before accepting traffic
initDb()
  .then(() => {
    server.listen(config.PORT, () => {
      console.log(`[XXQ Chat Server] Listening on port ${config.PORT} (${config.NODE_ENV})`);
      console.log(`[XXQ Chat Server] Storage Driver: ${dataStore.driverName}`);
      console.log(`[XXQ Chat Server] Initial Admin: ${config.INITIAL_ADMIN_EMAIL}`);
      console.log(`[XXQ Chat Server] Whitelist Access Control: ${config.WHITELIST_MODE_DEFAULT ? 'ENABLED' : 'DISABLED'}`);
    });
  })
  .catch((err) => {
    console.error('[XXQ Chat Server] Fatal DB initialization error:', err);
    process.exit(1);
  });

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`[XXQ Chat Server] Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    console.log('[XXQ Chat Server] Closed HTTP and Socket connections.');
    try {
      await closeDb();
      console.log('[XXQ Chat Server] Database connection closed.');
    } catch (e) {
      console.error('[XXQ Chat Server] Error closing database:', e);
    }
    process.exit(0);
  });

  // Force shutdown after 10s timeout
  setTimeout(() => {
    console.error('[XXQ Chat Server] Forceful shutdown after timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
