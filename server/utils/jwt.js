import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function signAdminToken(admin) {
  return jwt.sign(
    { sub: String(admin._id), role: admin.role, name: admin.name },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

export function verifyToken(token) {
  return jwt.verify(token, config.jwt.secret);
}

export default { signAdminToken, verifyToken };
