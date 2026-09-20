import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function signToken(payload) {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: Math.floor(config.jwtExpirationMs / 1000),
  });
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwtSecret);
}
