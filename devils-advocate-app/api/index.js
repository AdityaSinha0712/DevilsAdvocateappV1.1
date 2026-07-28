/**
 * Vercel Serverless Function — Catch-all API handler
 *
 * Wraps the existing Express app so all /api/* requests are handled
 * by the same Express routes (health, debate, analytics, etc.).
 *
 * Imports the pre-compiled backend from backend/dist/.
 */
import app from '../backend/dist/index.js';

export default app;
