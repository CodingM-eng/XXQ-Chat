import http from 'http';
import { app } from './app.js';
import { config } from './config.js';
import { setupSocketServer } from './sockets/index.js';
import { db } from './db/index.js';

const server = http.createServer(app);

// Attach Socket.IO
setupSocketServer(server);

server.listen(config.PORT, () => {
  console.log(`[XXQ Chat Server] Listening on port ${config.PORT} (${config.NODE_ENV})`);
  console.log(`[XXQ Chat Server] Initial Admin: ${config.INITIAL_ADMIN_EMAIL}`);
  console.log(`[XXQ Chat Server] Whitelist Access Control: ${config.WHITELIST_MODE_DEFAULT ? 'ENABLED' : 'DISABLED'}`);
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  console.log(`[XXQ Chat Server] Received ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('[XXQ Chat Server] Closed HTTP and Socket connections.');
    try {
      db.close();
      console.log('[XXQ Chat Server] SQLite database connection closed.');
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
