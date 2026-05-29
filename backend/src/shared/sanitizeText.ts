/**
 * Sanitização de texto livre vindo do PEC (prontuário) antes de enviar
 * para o app paciente.
 *
 * Por que: textos médicos (queixa principal, conduta, observações) são
 * digitados por atendentes/médicos. App Flutter renderiza com `Text(...)`
 * (seguro), mas se algum dia a UI usar `RichText`/HTML/Markdown, atributo
 * inline ou conteúdo malicioso pode causar XSS.
 *
 * Estratégia (defesa em profundidade):
 *   - Strip de HTML tags brutos (`<script>`, `<img onerror=...>`, etc.)
 *   - Strip de control chars (exceto `\n` e `\t`)
 *   - Strip de `\0`, BOM e zero-width Unicode (anti smuggle)
 *   - Normaliza CRLF → LF
 *   - Trim leading/trailing whitespace
 *   - Limita tamanho (default 4000 chars — pra prevenir DoS)
 *
 * **NÃO** decodifica entidades HTML (paciente pode ter "&" no nome).
 * **NÃO** escapa caracteres especiais — só remove tags e control chars.
 *
 * Retorna a string sanitizada, ou `null` se input for `null`/`undefined`.
 */

const ZERO_WIDTH = /[​-‍﻿⁠]/g;
const CONTROL_CHARS = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const HTML_TAGS = /<[^>]*>/g;

export function sanitizeText(
  input: string | null | undefined,
  maxLen = 4000,
): string | null {
  if (input === null || input === undefined) return null;
  if (typeof input !== 'string') return null;

  let s = input
    .replace(/\r\n/g, '\n')        // CRLF → LF
    .replace(HTML_TAGS, '')         // strip tags
    .replace(ZERO_WIDTH, '')        // strip invisíveis
    .replace(CONTROL_CHARS, '')     // strip control chars (preserva \n e \t)
    .trim();

  if (s.length > maxLen) {
    s = s.slice(0, maxLen).trim() + '…';
  }
  return s.length > 0 ? s : null;
}
