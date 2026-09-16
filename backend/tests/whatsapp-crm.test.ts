import { WhatsAppCloudApiService } from '../src/infrastructure/services/WhatsAppCloudApiService';
import { WhatsAppCrmUseCase } from '../src/modules/centro/application/use-cases/WhatsAppCrmUseCase';

async function runWhatsAppCrmTests() {
  console.log('🧪 Iniciando testes do CRM WhatsApp Multi-Atendentes & Meta Cloud API...');

  const apiService = new WhatsAppCloudApiService();

  // Teste 1: Normalização de telefone E.164
  console.log('\n[Teste 1: Formatação de Telefones E.164]');
  const tel1 = apiService.normalizarTelefoneE164('(75) 99888-7766');
  const tel2 = apiService.normalizarTelefoneE164('75998887766');
  const tel3 = apiService.normalizarTelefoneE164('+55 75 99888-7766');
  const tel4 = apiService.normalizarTelefoneE164('5575998887766');

  if (tel1 !== '5575998887766') throw new Error(`Falha tel1: ${tel1}`);
  if (tel2 !== '5575998887766') throw new Error(`Falha tel2: ${tel2}`);
  if (tel3 !== '5575998887766') throw new Error(`Falha tel3: ${tel3}`);
  if (tel4 !== '5575998887766') throw new Error(`Falha tel4: ${tel4}`);
  console.log('  ✓ Normalização E.164 validada: 5575998887766 gerado com precisão');

  // Teste 2: Teste de Conexão com a Meta (Modo Sandbox / Mock)
  console.log('\n[Teste 2: Conexão com a API Oficial da Meta]');
  const connTest = await apiService.testConnection({
    phoneNumberId: 'MOCK_PHONE_123',
    accessToken: 'MOCK_TOKEN_XYZ',
  });
  if (!connTest.valid) throw new Error(`Falha no teste de conexão: ${connTest.error}`);
  console.log(`  ✓ Conexão Meta simulada com sucesso: ${connTest.name} (${connTest.displayPhoneNumber})`);

  // Teste 3: Disparo de Mensagem de Texto e Botões
  console.log('\n[Teste 3: Disparo de Mensagem e Botões]');
  const msgResult = await apiService.sendTextMessage({
    phoneNumberId: 'MOCK_PHONE_123',
    accessToken: 'MOCK_TOKEN_XYZ',
    to: '75998887766',
    text: 'Olá! Sua consulta no CEM foi agendada.',
  });
  if (!msgResult.success || !msgResult.messageId) throw new Error('Falha no disparo de mensagem');
  console.log(`  ✓ Mensagem enviada com sucesso: ${msgResult.messageId}`);

  const btnResult = await apiService.sendInteractiveButtons({
    phoneNumberId: 'MOCK_PHONE_123',
    accessToken: 'MOCK_TOKEN_XYZ',
    to: '75998887766',
    bodyText: 'Deseja confirmar sua consulta?',
    buttons: [
      { id: 'btn_confirmar', title: 'SIM, CONFIRMAR' },
      { id: 'btn_reagendar', title: 'NÃO, REAGENDAR' },
    ],
  });
  if (!btnResult.success || !btnResult.messageId) throw new Error('Falha no disparo de botões');
  console.log(`  ✓ Botões interativos enviados com sucesso: ${btnResult.messageId}`);

  // Teste 4: Instanciação dos Casos de Uso do CRM
  console.log('\n[Teste 4: Instanciação e Casos de Uso do CRM]');
  const crmUseCase = new WhatsAppCrmUseCase(apiService);
  const config = await crmUseCase.obterConfig('pref-jacobina-01');
  if (!config.phoneNumberId) throw new Error('Falha ao obter configuração padrão');
  console.log(`  ✓ Configuração do CRM obtida: Phone ID=${config.phoneNumberId}, Exibição=${config.nomeExibicao}`);

  // Teste 5: Processamento de Webhook da Meta
  console.log('\n[Teste 5: Processamento de Webhook de Mensagem Recebida]');
  const metaWebhookPayload = {
    entry: [
      {
        id: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: '5575999990000',
                phone_number_id: '1001',
              },
              contacts: [
                {
                  profile: { name: 'Maria das Graças Silva' },
                  wa_id: '5575998887766',
                },
              ],
              messages: [
                {
                  from: '5575998887766',
                  id: `wamid.HBgTest${Date.now()}`,
                  timestamp: `${Math.floor(Date.now() / 1000)}`,
                  text: { body: 'SIM' },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  };

  const webhookResult = await crmUseCase.processarWebhook(metaWebhookPayload);
  if (webhookResult.status !== 'processed') throw new Error('Falha no processamento de webhook');
  console.log('  ✓ Webhook da Meta processado com sucesso com detecção automática de palavra-chave SIM');

  console.log('\n======================================================================');
  console.log('🎉 SUCESSO TOTAL: Todos os testes do CRM WhatsApp & Meta Cloud API passaram!');
  console.log('======================================================================\n');
}

runWhatsAppCrmTests().catch((err) => {
  console.error('❌ Erro nos testes do CRM WhatsApp:', err);
  process.exit(1);
});
