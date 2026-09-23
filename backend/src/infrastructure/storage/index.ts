/**
 * Factory de storage. Resolve via env STORAGE_PROVIDER=disk|s3.
 */
import type { IFileStorage } from '../../domain/services/IFileStorage';
import { env } from '../../shared/env';
import { DiskFileStorage } from './DiskFileStorage';
import { S3FileStorage } from './S3FileStorage';
import { logger } from '../logger';

export function buildFileStorage(): IFileStorage {
  const provider = env.STORAGE_PROVIDER.toLowerCase();

  if (provider === 's3') {
    if (!env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
      logger.error('STORAGE_PROVIDER=s3 mas S3_BUCKET/S3_ACCESS_KEY/S3_SECRET_KEY não definidos');
      throw new Error('S3 config incompleta');
    }

    logger.info({
      endpoint: env.S3_ENDPOINT || undefined,
      bucket: env.S3_BUCKET,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    }, 'storage: S3');
    return new S3FileStorage({
      region: env.S3_REGION,
      bucket: env.S3_BUCKET,
      accessKey: env.S3_ACCESS_KEY,
      secretKey: env.S3_SECRET_KEY,
      ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
    });
  }

  logger.info('storage: disk local');
  return new DiskFileStorage();
}
