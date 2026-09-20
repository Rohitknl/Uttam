import { verifyToken } from '../utils/jwt.js';
import { AppError } from './errorHandler.js';
import * as settingsService from '../services/settingsService.js';

export function authenticate(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AppError('Unauthorized', 401));
  }

  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      fullName: decoded.fullName,
    };
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}

export function optionalAuth(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.slice(7);
  try {
    const decoded = verifyToken(token);
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      fullName: decoded.fullName,
    };
  } catch {
    // ignore
  }
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError('Unauthorized', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Forbidden', 403));
    }
    next();
  };
}

export const requireAdmin = requireRole('ROLE_ADMIN');
export const requireAdminOrViewer = requireRole('ROLE_ADMIN', 'ROLE_VIEWER');
export const requireDealer = requireRole('ROLE_DEALER');

export function requireHerbCodeCrudPassword(req, _res, next) {
  const password = req.body?.crudPassword;
  if (!password) {
    return next(new AppError('Password is required', 403));
  }
  Promise.resolve()
    .then(async () => {
      const set = await settingsService.isCrudPasswordSet();
      if (!set) {
        throw new AppError('Set the Edit/Delete Herb Password first (Profile or first-time setup)', 403);
      }
      const ok = await settingsService.verifyCrudPassword(password);
      if (!ok) {
        throw new AppError('Invalid Edit/Delete Herb Password', 403);
      }
      delete req.body.crudPassword;
      next();
    })
    .catch(next);
}

export const requireAnyAuth = authenticate;
