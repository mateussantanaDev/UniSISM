const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = 'postgresql://qa:qa_local_only@127.0.0.1:55432/unisism_qa_cem';
process.env.JWT_SECRET = 'qa-unit-only-token-secret';
process.env.JWT_REFRESH_SECRET = 'qa-unit-only-refresh-secret';
const { WhatsAppCloudApiService } = require('../dist/infrastructure/services/WhatsAppCloudApiService');
const { statusConfiguracaoWhatsApp } = require('../dist/modules/centro/shared/whatsappConfig');
test('configuração distingue ausência de credenciais, demonstração e credenciais salvas', () => {
 assert.equal(statusConfiguracaoWhatsApp({phoneNumberId:'',accessToken:'',webhookVerifyToken:''}),'NAO_CONFIGURADA');
 assert.equal(statusConfiguracaoWhatsApp({phoneNumberId:'MOCK_1',accessToken:'MOCK_token',webhookVerifyToken:'x'}),'DEMONSTRATIVA');
 assert.equal(statusConfiguracaoWhatsApp({phoneNumberId:'123',accessToken:'saved',webhookVerifyToken:'verify'}),'CONFIGURADA');
});
test('demonstração nunca finge conexão/envio nem chama rede', async () => {
 const original=global.fetch; global.fetch=async()=>{throw Error('Não pode acessar rede em modo demonstrativo');};
 try {const s=new WhatsAppCloudApiService();const p={phoneNumberId:'DEMO_1',accessToken:'DEMO_token',to:'81999999999',text:'QA'};
 assert.equal((await s.testConnection(p)).valid,false);
 assert.equal((await s.sendTextMessage(p)).success,false);
 assert.equal((await s.sendInteractiveButtons({...p,bodyText:'QA',buttons:[]})).success,false);
 } finally {global.fetch=original;}
});
