// Process entry point: loads config, verifies the database, then listens.
import './config/load-env.js';
import app from './app.js';
import { testDbConnection, pool } from './config/db.js';
import { logger } from './utils/logger.js';

const PORT = Number(process.env.PORT) || 5000;

await testDbConnection();   // exit early with guidance if MySQL is unreachable

const server = app.listen(PORT, () => {
  logger.info(`Ganza Mart API listening on http://localhost:${PORT}`);
  logger.info(`CORS allowed origin: ${process.env.CLIENT_URL}`);
});

// Graceful shutdown: finish in-flight requests, then release DB connections.
// This prevents orphaned transactions when you press Ctrl+C in the terminal.
async function shutdown(signal) {
  logger.info(`${signal} received — shutting down…`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
  // Force-exit if closing hangs for more than 10s.
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
