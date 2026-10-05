const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL ||= 'postgresql://qa:qa_local_only@127.0.0.1:55432/unisism_qa_cem';
process.env.JWT_SECRET ||= 'test-jwt-secret-test-jwt-secret-test';
process.env.JWT_REFRESH_SECRET ||= 'test-refresh-secret-test-refresh-secret';
const { prisma } = require('../dist/infrastructure/database/prisma');
const { buildScope } = require('../dist/shared/scope');
const { makeAuthenticate } = require('../dist/presentation/middlewares/authenticate');
const { WhatsAppCrmUseCase } = require('../dist/modules/centro/application/use-cases/WhatsAppCrmUseCase');
const { authorizeUsuarioManagement } = require('../dist/application/admin/authorizeUsuarioManagement');
const patch = (obj,key,fn) => { const original=obj[key]; obj[key]=fn; return ()=>obj[key]=original; };

test('coordenador só recebe escopo municipal com vínculo CEM/CEO explícito e prefeitura',()=>{
 const base={atendenteId:'coord',role:'COORDENADOR_UBS',prefeituraId:'pref'};
 for(const tipoUnidade of ['CEM','CEO']) assert.deepEqual(buildScope({...base,tipoUnidade}),{kind:'PREFEITURA',prefeituraId:'pref'});
 for(const tipoUnidade of [null,'UBS','SMS']) assert.throws(()=>buildScope({...base,tipoUnidade}),e=>e.code==='USUARIO_SEM_UBS');
 assert.throws(()=>buildScope({...base,tipoUnidade:'CEM',prefeituraId:null}),e=>e.code==='USUARIO_SEM_PREFEITURA');
 assert.equal(buildScope({...base,tipoUnidade:'CEM',ubsId:'ubs'}).kind,'UBS');
});

test('autenticação verifica revogação, expiração, titularidade e obrigatoriedade no servidor',async()=>{
 let user={ativo:true,deletadoEm:null,role:'MEDICO',ubsId:null,prefeituraId:'pref',tipoUnidade:'CEM',trocaSenhaObrigatoria:false};
 let session={atendenteId:'user',revogadaEm:null,expiraEm:new Date(Date.now()+60000)};
 const undo=[patch(prisma.atendente,'findUnique',async()=>user),patch(prisma.sessao,'findUnique',async()=>session)];
 const tokens={verificarAccess:()=>({sub:'user',role:'DESENVOLVEDOR',sid:'sid'})};
 async function auth(allow=false){const req={header:()=> 'Bearer valid'};let error;await makeAuthenticate(tokens,allow)(req,{},e=>error=e);return {req,error};}
 try {
  assert.equal((await auth()).req.auth.role,'MEDICO');
  user.trocaSenhaObrigatoria=true;
  assert.equal((await auth()).error.code,'TROCA_SENHA_OBRIGATORIA');
  assert.equal((await auth(true)).error,undefined);
  for(const change of [{revogadaEm:new Date()},{expiraEm:new Date(0)},{atendenteId:'other'}]){
   const before=session;session={...session,...change};assert.equal((await auth(true)).error.code,'SESSAO_REVOGADA');session=before;
  }
  session=null;assert.equal((await auth()).error.code,'SESSAO_REVOGADA');
 } finally {undo.reverse().forEach(f=>f());}
});

test('gestão de usuários não confunde escopo municipal com papel administrativo',async()=>{
 let actor={id:'actor',ativo:true,role:'REGULADOR_SMS',prefeituraId:'pref',tipoUnidade:'CEM'};
 const undo=patch(prisma.atendente,'findUnique',async()=>actor);
 try {
  for(const role of ['ADMIN','DESENVOLVEDOR','COORDENADOR_UBS','REGULADOR_SMS'])await assert.rejects(authorizeUsuarioManagement('actor',{role,prefeituraId:'pref'}),e=>e.code==='PERMISSAO_INSUFICIENTE');
  await authorizeUsuarioManagement('actor',{role:'MEDICO',prefeituraId:'pref'});
  await assert.rejects(authorizeUsuarioManagement('actor',{role:'MEDICO',prefeituraId:'other'}));
  actor={...actor,role:'ADMIN'};await authorizeUsuarioManagement('actor',{role:'ADMIN',prefeituraId:'pref'});
  await assert.rejects(authorizeUsuarioManagement('actor',{role:'DESENVOLVEDOR',prefeituraId:'pref'}));
  actor={...actor,role:'DESENVOLVEDOR'};await authorizeUsuarioManagement('actor',{role:'DESENVOLVEDOR'});
 } finally {undo();}
});

test('configuração pública omite segredos sem remover credenciais usadas internamente',async()=>{
 const config={id:'cfg',prefeituraId:'pref',phoneNumberId:'phone',accessToken:'short',webhookVerifyToken:'verify-secret'};
 let used;
 const undo=patch(prisma.whatsAppConfig,'findFirst',async()=>config);
 try {
  const uc=new WhatsAppCrmUseCase({testConnection:async args=>{used=args;return {valid:true};}});
  const publicConfig=await uc.obterConfigPublica('pref');
  assert(!('accessToken' in publicConfig));assert(!('webhookVerifyToken' in publicConfig));
  assert(!JSON.stringify(publicConfig).includes('short'));assert(!JSON.stringify(publicConfig).includes('verify-secret'));
  await uc.testarConexao('pref');assert.equal(used.accessToken,'short');assert.equal(used.phoneNumberId,'phone');
 } finally {undo();}
});
