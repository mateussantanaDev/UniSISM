/**
 * Middleware que adiciona `X-Server-Time` (ISO 8601 UTC) em toda resposta GET.
 *
 * Usado pelo app do motorista (offline-first) como cursor de sync incremental:
 * a próxima chamada de `/motorista-app/minhas-viagens` usa `?desde=` igual ao
 * `X-Server-Time` da response anterior. Garante consistência mesmo com clock
 * drift no dispositivo.
 *
 * Spec: backend/docs/MOTORISTA_APP_API.md §3.1
 */
import type { Request, Response, NextFunction } from 'express';

export function serverTime(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET') {
    res.setHeader('X-Server-Time', new Date().toISOString());
  }
  next();
}
