export function notFoundHandler(req, res) {
  return res.status(404).json({ error: 'API endpoint not found' });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Request body must be valid JSON' });
  if (error?.code === 11000) return res.status(409).json({ error: 'A record with this value already exists' });
  if (error?.message === 'Origin is not allowed by CORS') return res.status(403).json({ error: 'Request origin is not allowed' });
  if ([400, 403, 404, 409].includes(error?.statusCode)) return res.status(error.statusCode).json({ error: error.message });
  if (error?.name === 'ValidationError') return res.status(400).json({ error: 'Submitted data failed validation' });
  if (error?.name === 'CastError') return res.status(400).json({ error: 'A submitted identifier or value is invalid' });

  // Do not log request bodies, credentials, cookies, tokens or medical data.
  const safePath = req.path.startsWith('/api/patients/') ? '/api/patients/:resource' : req.path;
  console.error('API error', { method: req.method, path: safePath, errorName: error?.name || 'Error' });
  return res.status(500).json({ error: 'An unexpected server error occurred' });
}
