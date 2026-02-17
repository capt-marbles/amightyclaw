import { compareSync } from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { AppConfig } from '@amightyclaw/core';
import { getLogger } from '@amightyclaw/core';

const log = getLogger('auth');

export function createAuthRouter(config: AppConfig): ReturnType<typeof Router> {
  const router = Router();

  router.post('/login', (req: Request, res: Response) => {
    const { password } = req.body as { password?: string };
    if (!password) {
      res.status(400).json({ error: 'Password required' });
      return;
    }

    if (!compareSync(password, config.password)) {
      log.warn('Failed login attempt');
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const token = jwt.sign({ sub: 'user', iat: Math.floor(Date.now() / 1000) }, config.jwtSecret, {
      expiresIn: '24h',
    });

    log.info('User logged in');
    res.json({ token, expiresIn: 86400 });
  });

  return router;
}

export function createAuthMiddleware(config: AppConfig) {
  return (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No token provided' });
      return;
    }

    const token = authHeader.slice(7);
    try {
      jwt.verify(token, config.jwtSecret);
      next();
    } catch {
      res.status(401).json({ error: 'Invalid token' });
    }
  };
}

export function verifyToken(token: string, secret: string): boolean {
  try {
    jwt.verify(token, secret);
    return true;
  } catch {
    return false;
  }
}
