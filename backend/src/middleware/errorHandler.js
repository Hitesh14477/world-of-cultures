export function notFoundHandler(req, res) {
  res.status(404).json({
    status: 'error',
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) {
    return next(error);
  }

  const candidateStatus = error.statusCode ?? error.status;
  const statusCode = Number.isInteger(candidateStatus) ? candidateStatus : 500;
  const message = statusCode >= 500 ? 'An unexpected server error occurred.' : error.message;

  return res.status(statusCode).json({
    status: 'error',
    message,
  });
}
