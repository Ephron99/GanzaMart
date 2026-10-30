import { Router } from 'express';
import { pool } from '../config/db.js';

// GET /api/health — used by the developer (and later the README troubleshooting
// section) to prove at a glance that the server AND its database are alive.
const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT 1 + 1 AS ok');
    res.json({
      success: true,
      status: 'ok',
      database: rows[0].ok === 2 ? 'connected' : 'unexpected',
      time: new Date().toISOString(),
    });
  } catch (err) {
    next(err); // falls through to the centralized error handler
  }
});

export default router;
