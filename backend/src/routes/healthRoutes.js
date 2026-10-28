import { Router } from 'express';
import { getDatabaseStatus } from '../config/db.js';

const router = Router();

router.get('/', (req, res) => {
  const database = getDatabaseStatus();
  const ready = database === 'connected';
  res.status(ready ? 200 : 503).json({
    status: ready ? 'ok' : 'degraded',
    service: 'bedallocation-api',
    database,
    timestamp: new Date().toISOString()
  });
});

export default router;
