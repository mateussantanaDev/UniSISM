export function statusConfiguracaoWhatsApp(config: { phoneNumberId: string; accessToken: string; webhookVerifyToken: string }): 'NAO_CONFIGURADA' | 'DEMONSTRATIVA' | 'CONFIGURADA' {
  if (/^(MOCK_|DEMO_)/i.test(config.phoneNumberId) || /^(MOCK_|DEMO_)/i.test(config.accessToken)) return 'DEMONSTRATIVA';
  if (!config.phoneNumberId.trim() || !config.accessToken.trim() || !config.webhookVerifyToken.trim()) return 'NAO_CONFIGURADA';
  return 'CONFIGURADA';
}
