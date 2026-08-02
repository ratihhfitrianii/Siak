import type { AuthUser } from '../lib/auth-middleware';

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
