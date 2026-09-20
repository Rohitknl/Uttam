export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
    this.name = 'AppError';
  }
}

export function errorHandler(err, req, res, _next) {
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  console.error(`[${new Date().toISOString()}] ${status} ${message}`, err.stack);

  res.status(status).json({
    message,
    status,
    timestamp: new Date().toISOString(),
  });
}

export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
