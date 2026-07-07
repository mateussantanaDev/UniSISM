const test = require('node:test');
const assert = require('node:assert/strict');

const { getAdminConfiguracoes } = require('../dist/shared/adminConfig.js');

test('getAdminConfiguracoes expõe política de senha, SLA, LGPD e upload', () => {
  const cfg = getAdminConfiguracoes({ MAX_UPLOAD_MB: '12' });

  assert.equal(cfg.senhaMinimaCaracteres, 8);
  assert.equal(cfg.senhaHistoricoBloqueado, 5);
  assert.equal(cfg.senhaValidadeDias, 180);
  assert.deepEqual(cfg.slaPorPrioridade, {
    EMERGENCIA: 12,
    URGENTE: 48,
    PRIORITARIA: 168,
    ELETIVA: 720,
  });
  assert.equal(cfg.retencaoProntuarioAnos, 20);
  assert.equal(cfg.retencaoAuditLogAnos, 5);
  assert.equal(cfg.retencaoSessaoDias, 90);
  assert.equal(cfg.maxUploadMb, 12);
});
