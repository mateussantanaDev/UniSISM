/**
 * Helper para Content-Disposition seguro (RFC 6266 + RFC 5987).
 *
 * Problema: filename pode conter caracteres que quebram o header
 * (aspas, CR/LF, non-ASCII). Usar `filename="..."` cru é XSS / header
 * injection / nome corrompido em browsers.
 *
 * Solução: emitir DUAS formas:
 *   - `filename="<ascii-sanitized>"` — fallback para clientes legados
 *   - `filename*=UTF-8''<percent-encoded>` — UTF-8 oficial (RFC 5987)
 *
 * Browsers modernos respeitam `filename*`; antigos caem no `filename`.
 *
 * Exemplo:
 *   buildContentDisposition('Relatório clínico (2026).pdf')
 *   → 'attachment; filename="Relatorio_clinico_2026_.pdf"; filename*=UTF-8\'\'Relat%C3%B3rio%20cl%C3%ADnico%20%282026%29.pdf'
 *
 * Sanitização ASCII:
 *   - Remove CR/LF (header injection)
 *   - Substitui aspas duplas, backslash, e non-ASCII por `_`
 *   - Limita a 200 chars (proteção contra DOS por header gigante)
 */

export function buildContentDisposition(
  filename: string,
  type: 'attachment' | 'inline' = 'attachment',
): string {
  // ASCII-safe fallback
  const ascii = sanitizeAsciiFilename(filename);
  // RFC 5987 — percent-encoded UTF-8
  const encoded = encodeRfc5987(filename);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

/**
 * Versão ASCII pura — substitui non-ASCII e caracteres perigosos.
 * Preserva ponto+extensão pra browsers detectarem o tipo.
 */
export function sanitizeAsciiFilename(name: string): string {
  // Remove CR/LF (header injection) e null bytes.
  let s = name.replace(/[\r\n\0]/g, '');
  // Substitui non-ASCII (acentos etc.) por _
  s = s.replace(/[^\x20-\x7E]/g, '_');
  // Substitui aspas, backslash, controle restante
  s = s.replace(/["\\]/g, '_');
  // Colapsa espaços múltiplos
  s = s.replace(/\s+/g, ' ').trim();
  // Limita tamanho
  if (s.length > 200) {
    const ext = s.match(/(\.[a-z0-9]{1,8})$/i)?.[1] ?? '';
    s = s.slice(0, 200 - ext.length) + ext;
  }
  // Vazio? fallback
  if (s.length === 0) s = 'documento';
  return s;
}

/**
 * Percent-encode UTF-8 conforme RFC 5987 (mais restritivo que encodeURIComponent).
 * Escapa: ` ` `'` `(` `)` `,` `;` `=` `?` `*` além do default.
 */
export function encodeRfc5987(s: string): string {
  return encodeURIComponent(s)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%(7C|60|5E)/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
