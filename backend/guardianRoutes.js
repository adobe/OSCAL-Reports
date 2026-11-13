/**
 * Concept: Mukesh Kesharwani
 * Contact: mukesh.kesharwani@adobe.com
 */
import { GuardianError, guardianService } from './guardianService.js';
import express from 'express';
import { guardianAssessmentService, GUARDIAN_PREVIEW_BYTES } from './guardianAssessments.js';

export const guardianJsonMiddleware = [
  (req, res, next) => ['/assessments/preview', '/assessments/finalize'].includes(req.path)
    ? express.json({ limit: GUARDIAN_PREVIEW_BYTES })(req, res, next) : next(),
  express.json({ limit: '2mb' }),
  (error, req, res, next) => {
    if (error.status >= 400 && error.status < 500) {
      const limit = ['/assessments/preview', '/assessments/finalize'].includes(req.path) ? 16 : 2;
      return res.status(error.status).json({ error: error.status === 413
        ? `Guardian request exceeds the ${limit} MiB limit.` : 'Invalid Guardian JSON request.' });
    }
    return next(error);
  },
];

export function registerGuardianRoutes(app, authenticate, service = guardianService, assessments = guardianAssessmentService) {
  const assessmentRoute = (method, path, handler) => {
    app[method](`/api/guardian/assessments/${path}`, authenticate, async (req, res) => {
      res.set('Cache-Control', 'no-store');
      if (method === 'post' && !/^Bearer\s+\S+$/i.test(req.headers.authorization || '')) {
        return res.status(401).json({ error: 'Explicit session bearer authentication is required.' });
      }
      try {
        res.json(await handler(req));
      } catch (error) {
        const known = error instanceof GuardianError;
        console.warn(JSON.stringify({
          'service.name': 'oscal-report-generator', severity: 'WARN',
          'event.action': 'guardian_assessment', 'event.outcome': 'failure',
          reason: known ? error.code : 'guardian_unavailable',
          ...(known && error.upstreamStatus ? { 'http.response.status_code': error.upstreamStatus } : {}),
        }));
        res.status(known ? error.status : 503).json({
          code: known ? error.code : 'guardian_unavailable',
          error: known ? error.message : 'Guardian assessment integration is unavailable.',
        });
      }
    });
  };
  assessmentRoute('get', 'status', req => assessments.status(req.user));
  assessmentRoute('get', 'runs', req => assessments.runs(req.user, req.query));
  assessmentRoute('get', 'result', req => assessments.assessment(req.user, req.query));
  assessmentRoute('post', 'preview', req => assessments.preview(req.user, req.body));
  assessmentRoute('post', 'finalize', req => assessments.finalize(req.user, req.body));

  app.get('/api/guardian/status', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json(await service.status(req.user));
    } catch {
      res.status(503).json({ error: 'Guardian status is unavailable.' });
    }
  });

  app.post('/api/guardian/apply', authenticate, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // Require explicit OSCAL bearer authentication: cookies/query credentials cannot
    // authorize this write, even when deployment-wide CSRF protection is disabled.
    if (!/^Bearer [^\s]+$/.test(req.headers.authorization || '')) {
      return res.status(401).json({ error: 'Explicit session bearer authentication is required.' });
    }
    try {
      res.json(await service.apply(req.user, req.body));
    } catch (error) {
      const known = error instanceof GuardianError;
      console.warn(JSON.stringify({
        'service.name': 'oscal-report-generator',
        'service.version': process.env.npm_package_version || 'unknown',
        'deployment.environment': process.env.NODE_ENV || 'development',
        severity: 'WARN', 'event.action': 'guardian_ssp_apply',
        'event.outcome': 'failure', reason: known ? error.code : 'guardian_unavailable',
      }));
      res.status(known ? error.status : 503).json({
        code: known ? error.code : 'guardian_unavailable',
        error: known ? error.message : 'Guardian integration is unavailable.',
      });
    }
  });
}