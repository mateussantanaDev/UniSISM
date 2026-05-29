export interface ArquivoArmazenado {
  caminho: string; // identificador lógico (ex.: path relativo ou chave S3)
  tamanhoKb: number;
}

export interface IFileStorage {
  salvar(input: {
    nomeOriginal: string;
    mimeType: string;
    buffer: Buffer;
    pasta: string;
  }): Promise<ArquivoArmazenado>;

  caminhoAbsoluto(caminho: string): string;

  /** Obtém o conteúdo binário como Readable stream (usado em download). */
  obterStream(caminho: string): Promise<import('node:stream').Readable>;
}
