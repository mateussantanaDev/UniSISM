/**
 * Storage S3-compatible (AWS S3 ou MinIO).
 *
 * Uso:
 *   STORAGE_PROVIDER=s3
 *   S3_ENDPOINT=http://localhost:9000  (para MinIO)
 *   S3_BUCKET=unisism-anexos
 *   S3_ACCESS_KEY=..., S3_SECRET_KEY=...
 *
 * Persiste o arquivo em S3 e retorna como `caminho` a chave (key) S3.
 * `caminhoAbsoluto` não faz sentido em S3 — retorna a key prefixada com `s3://bucket/key`
 * (apenas identificador; o download real deve ser via URL pré-assinada).
 */
import crypto from 'node:crypto';
import path from 'node:path';
import {
  CreateBucketCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { ArquivoArmazenado, IFileStorage } from '../../domain/services/IFileStorage';
import { logger } from '../logger';

export interface S3Config {
  endpoint?: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  forcePathStyle?: boolean;
}

export class S3FileStorage implements IFileStorage {
  private readonly client: S3Client;
  private readonly bucket: string;
  private bucketChecked = false;

  constructor(cfg: S3Config) {
    this.bucket = cfg.bucket;
    const clientConfig: {
      region: string;
      credentials: { accessKeyId: string; secretAccessKey: string };
      endpoint?: string;
      forcePathStyle?: boolean;
    } = {
      region: cfg.region,
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    };
    if (cfg.endpoint) clientConfig.endpoint = cfg.endpoint;
    if (cfg.forcePathStyle !== undefined) clientConfig.forcePathStyle = cfg.forcePathStyle;
    this.client = new S3Client(clientConfig);
  }

  private async garantirBucket(): Promise<void> {
    if (this.bucketChecked) return;
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        logger.info({ bucket: this.bucket }, 'bucket S3 criado');
      } catch (err) {
        logger.warn({ err, bucket: this.bucket }, 'falha ao criar bucket (pode já existir)');
      }
    }
    this.bucketChecked = true;
  }

  async salvar(input: {
    nomeOriginal: string;
    mimeType: string;
    buffer: Buffer;
    pasta: string;
  }): Promise<ArquivoArmazenado> {
    await this.garantirBucket();
    const ext = path.extname(input.nomeOriginal) || '';
    const nome = crypto.randomBytes(16).toString('hex') + ext;
    const key = path.posix.join(input.pasta, nome);
    const sha256 = crypto.createHash('sha256').update(input.buffer).digest('hex');

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: input.buffer,
        ContentType: input.mimeType,
        Metadata: { 'sha-256': sha256, 'nome-original': encodeURIComponent(input.nomeOriginal) },
      }),
    );

    return {
      caminho: key,
      tamanhoKb: Math.max(1, Math.round(input.buffer.byteLength / 1024)),
    };
  }

  /**
   * Em S3, `caminhoAbsoluto` não é um path de FS. Retornamos um identificador
   * `s3://bucket/key` apenas pra debug/log. O download real deve ser via
   * `gerarUrlPreAssinada(key)` em um controller específico.
   */
  caminhoAbsoluto(caminho: string): string {
    return `s3://${this.bucket}/${caminho}`;
  }

  /** Gera URL pré-assinada (GET) com TTL em segundos. */
  async gerarUrlPreAssinada(key: string, ttlSeconds = 300): Promise<string> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
  }

  async obterStream(caminho: string): Promise<import('node:stream').Readable> {
    const r = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: caminho }),
    );
    if (!r.Body) throw new Error(`S3 object ${caminho} sem body`);
    // r.Body é um Readable em Node
    return r.Body as import('node:stream').Readable;
  }

  async deletar(caminho: string): Promise<void> {
    await this.garantirBucket();
    try {
      await this.client.send(
        new DeleteObjectCommand({
          Bucket: this.bucket,
          Key: caminho,
        }),
      );
    } catch (err) {
      logger.warn({ err, bucket: this.bucket, key: caminho }, 'falha ao deletar objeto S3');
    }
  }
}
