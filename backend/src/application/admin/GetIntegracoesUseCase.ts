import fs from 'node:fs';
import net from 'node:net';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';
import { PdfParseService } from '../../infrastructure/services/PdfParseService';
import { prisma } from '../../infrastructure/database/prisma';

export interface IntegracaoStatus {
  nome: string;
  descricao: string;
  tipo: 'Federal' | 'Interno';
  status: 'online' | 'offline';
  latencyMs: number;
  mensagem: string;
}

export interface IntegracaoConfigResponse {
  nome: string;
  url: string;
  usuario: string | null;
  token: string | null;
  temSenha: boolean;
}

export interface IntegracoesResponse {
  status: 'online' | 'degraded' | 'offline';
  checkedAt: string;
  integracoes: IntegracaoStatus[];
  configuracoes: IntegracaoConfigResponse[];
}

const dummyPdfBuffer = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 21 >>\nstream\nBT /F1 12 Tf ET\nendstream\nendobj\nxref\n0 5\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000216 00000 n \ntrailer\n<< /Size 5 /Root 1 0 R >>\nstartxref\n288\n%%EOF'
);

export class GetIntegracoesUseCase {
  async exec(): Promise<IntegracoesResponse> {
    const checkedAt = new Date().toISOString();

    // Buscar configurações salvas no banco
    const dbConfigs = await prisma.configuracaoIntegracao.findMany();
    const configsMap = new Map(dbConfigs.map((c) => [c.nome, c]));

    const promises: Promise<IntegracaoStatus>[] = [
      this.checkConectorPeloBanco('CADSUS', 'Cadastro Nacional de Usuários do SUS', 'Federal', configsMap),
      this.checkConectorPeloBanco('e-SUS APS', 'Sincronização do PEC municipal', 'Federal', configsMap),
      this.checkConectorPeloBanco('SISREG', 'Sistema Nacional de Regulação', 'Federal', configsMap),
      this.checkConectorPeloBanco('Webhook UBS', 'Notificação de decisões da Regulação', 'Interno', configsMap),
      this.checkStorageS3(),
      this.checkClamav(),
      this.checkOcr(),
    ];

    const results = await Promise.all(promises);

    // Calcular status global do backend/integracoes
    const offlinesCount = results.filter((r) => r.status === 'offline').length;
    let globalStatus: 'online' | 'degraded' | 'offline' = 'online';
    if (offlinesCount === results.length) {
      globalStatus = 'offline';
    } else if (offlinesCount > 0) {
      globalStatus = 'degraded';
    }

    return {
      status: globalStatus,
      checkedAt,
      integracoes: results,
      configuracoes: dbConfigs.map((c) => ({
        nome: c.nome,
        url: c.url,
        usuario: c.usuario,
        token: c.token,
        temSenha: !!c.senha,
      })),
    };
  }

  private async pingUrl(
    url: string,
    headers: Record<string, string> = {},
    timeoutMs = 3000
  ): Promise<{ status: 'online' | 'offline'; latencyMs: number; msg: string }> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      if (res.ok || res.status < 500) {
        return {
          status: 'online',
          latencyMs,
          msg: `Conectado com sucesso (HTTP ${res.status})`,
        };
      } else {
        return {
          status: 'offline',
          latencyMs,
          msg: `Falha no servidor remoto: HTTP ${res.status}`,
        };
      }
    } catch (err: any) {
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      return {
        status: 'offline',
        latencyMs,
        msg: `Falha na conexão: ${err.message ?? err}`,
      };
    }
  }

  private async checkConectorPeloBanco(
    nome: string,
    descricao: string,
    tipo: 'Federal' | 'Interno',
    configsMap: Map<string, any>
  ): Promise<IntegracaoStatus> {
    const config = configsMap.get(nome);
    if (!config) {
      return {
        nome,
        descricao,
        tipo,
        status: 'offline',
        latencyMs: 0,
        mensagem: 'Configuração pendente — configure este conector para ativá-lo',
      };
    }

    const headers: Record<string, string> = {};
    if (config.token) {
      headers['Authorization'] = `Bearer ${config.token}`;
    } else if (config.usuario && config.senha) {
      const creds = Buffer.from(`${config.usuario}:${config.senha}`).toString('base64');
      headers['Authorization'] = `Basic ${creds}`;
    }

    const check = await this.pingUrl(config.url, headers);
    return {
      nome,
      descricao,
      tipo,
      status: check.status,
      latencyMs: check.latencyMs,
      mensagem: `${check.msg} (Endpoint: ${config.url})`,
    };
  }

  private async checkStorageS3(): Promise<IntegracaoStatus> {
    const provider = process.env['STORAGE_PROVIDER'] || 'disk';
    const start = Date.now();

    if (provider === 's3') {
      const bucket = process.env['S3_BUCKET'] || '';
      try {
        const clientConfig = {
          region: process.env['S3_REGION'] || 'us-east-1',
          credentials: {
            accessKeyId: process.env['S3_ACCESS_KEY'] || '',
            secretAccessKey: process.env['S3_SECRET_KEY'] || '',
          },
          endpoint: process.env['S3_ENDPOINT'],
          forcePathStyle: (process.env['S3_FORCE_PATH_STYLE'] ?? 'true') === 'true',
        };
        const client = new S3Client(clientConfig);
        await client.send(new HeadBucketCommand({ Bucket: bucket }));
        const latencyMs = Date.now() - start;
        return {
          nome: 'Storage S3',
          descricao: 'Armazenamento de anexos e relatórios',
          tipo: 'Interno',
          status: 'online',
          latencyMs,
          mensagem: `Object Storage S3 ativo (bucket: ${bucket})`,
        };
      } catch (err: any) {
        const latencyMs = Date.now() - start;
        return {
          nome: 'Storage S3',
          descricao: 'Armazenamento de anexos e relatórios',
          tipo: 'Interno',
          status: 'offline',
          latencyMs,
          mensagem: `Erro de conexão S3 bucket "${bucket}": ${err.message}`,
        };
      }
    }

    // Disk
    const uploadDir = process.env['UPLOAD_DIR'] || './uploads';
    try {
      fs.accessSync(uploadDir, fs.constants.W_OK);
      const latencyMs = Date.now() - start;
      return {
        nome: 'Storage S3',
        descricao: 'Armazenamento de anexos e relatórios (Modo Local)',
        tipo: 'Interno',
        status: 'online',
        latencyMs,
        mensagem: `Armazenamento local gravação OK (${uploadDir})`,
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        nome: 'Storage S3',
        descricao: 'Armazenamento de anexos e relatórios (Modo Local)',
        tipo: 'Interno',
        status: 'offline',
        latencyMs,
        mensagem: `Armazenamento local inacessível: ${err.message}`,
      };
    }
  }

  private async checkClamav(): Promise<IntegracaoStatus> {
    const host = process.env['CLAMAV_HOST'];
    const port = Number(process.env['CLAMAV_PORT'] ?? 3310);

    if (!host) {
      return {
        nome: 'ClamAV',
        descricao: 'Varredura antivírus em uploads',
        tipo: 'Interno',
        status: 'online',
        latencyMs: 0,
        mensagem: 'Scanner no-op ativo (ClamAV desativado em desenvolvimento)',
      };
    }

    const start = Date.now();
    return new Promise<IntegracaoStatus>((resolve) => {
      const socket = new net.Socket();
      let resolved = false;

      socket.setTimeout(1500);

      socket.connect(port, host, () => {
        if (!resolved) {
          resolved = true;
          const latencyMs = Date.now() - start;
          socket.destroy();
          resolve({
            nome: 'ClamAV',
            descricao: 'Varredura antivírus em uploads',
            tipo: 'Interno',
            status: 'online',
            latencyMs,
            mensagem: `Daemon ClamAV ativo em ${host}:${port}`,
          });
        }
      });

      const handleError = (msg: string) => {
        if (!resolved) {
          resolved = true;
          const latencyMs = Date.now() - start;
          socket.destroy();
          resolve({
            nome: 'ClamAV',
            descricao: 'Varredura antivírus em uploads',
            tipo: 'Interno',
            status: 'offline',
            latencyMs,
            mensagem: msg,
          });
        }
      };

      socket.on('error', (err) => handleError(`Falha na conexão com ClamAV daemon: ${err.message}`));
      socket.on('timeout', () => handleError('Timeout ao conectar com ClamAV daemon (1500ms)'));
    });
  }

  private async checkOcr(): Promise<IntegracaoStatus> {
    const start = Date.now();
    try {
      const pdfService = new PdfParseService();
      await pdfService.extrair(dummyPdfBuffer);
      const latencyMs = Date.now() - start;
      return {
        nome: 'OCR Service',
        descricao: 'Extração estruturada de PDFs',
        tipo: 'Interno',
        status: 'online',
        latencyMs,
        mensagem: 'Serviço de parsing PDF/OCR operacional',
      };
    } catch (err: any) {
      const latencyMs = Date.now() - start;
      return {
        nome: 'OCR Service',
        descricao: 'Extração estruturada de PDFs',
        tipo: 'Interno',
        status: 'offline',
        latencyMs,
        mensagem: `Erro no motor de OCR: ${err.message}`,
      };
    }
  }
}
