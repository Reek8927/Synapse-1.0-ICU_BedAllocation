import app from './app.js';
import { connectDatabase } from './config/db.js';
import { validateRuntimeEnv } from './config/env.js';

const port = Number(process.env.PORT || 5000);

try {
  validateRuntimeEnv();
  await connectDatabase();
  const server = app.listen(port, () => {
    console.log(`BedAllocation API listening on http://localhost:${port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received; closing HTTP server`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
} catch (error) {
  console.error(`Startup failed: ${error.message}`);
  process.exit(1);
}
