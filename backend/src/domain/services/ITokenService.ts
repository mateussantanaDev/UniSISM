export interface AccessTokenPayload {
  sub: string; // atendenteId
  role: string;
  ubsId?: string | null;
  prefeituraId?: string | null;
  sid?: string; // sessaoId

  // Face 4 · App do motorista — usados apenas quando role === 'MOTORISTA_TFD'.
  motoristaId?: string;
  primeiroLogin?: boolean;
}

export interface ITokenService {
  /** Para app mobile (Face 3/4) passe `ttlSecondsOverride` (sessão longa). */
  assinarAccess(payload: AccessTokenPayload, ttlSecondsOverride?: number): string;
  verificarAccess(token: string): AccessTokenPayload;

  gerarRefresh(): { token: string; hash: string; expiraEm: Date };
  hashRefresh(token: string): string;

  ttlAccessSeconds(): number;
}
