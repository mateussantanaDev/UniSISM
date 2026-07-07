<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { api } from '$lib/api';
	import { onMount } from 'svelte';

	const auth = useAuth();
	const podeEditar = $derived(auth.me?.role === 'DESENVOLVEDOR' || auth.me?.role === 'ADMIN');

	let carregando = $state(true);
	let enviando = $state(false);
	let erro = $state('');
	let sucessoMsg = $state('');

	// 1. SLA por Prioridade (Horas)
	let slaEmergencia = $state('2');
	let slaUrgente = $state('12');
	let slaPrioritaria = $state('72');
	let slaEletiva = $state('240');

	// 2. Política de Senha
	let senhaMin = $state('8');
	let senhaValidade = $state('180');
	let senhaTentativas = $state('5');
	let senhaBloqueio = $state('30');
	let twoFA = $state(false);

	// 3. Uploads
	let uploadMaxArq = $state('10');
	let uploadMaxReq = $state('30');
	let uploadMimes = $state('pdf, jpg, png');
	let uploadScan = $state(true);

	// 4. Retenção LGPD
	let retencaoEncaminhamentos = $state('20');
	let retencaoProntuario = $state('999');
	let retencaoAudit = $state('5');
	let retencaoSessoes = $state('90');

	onMount(async () => {
		try {
			const res = await api.admin.getConfiguracoes();
			if (res) {
				// 1. SLA
				if (res.sla) {
					slaEmergencia = String(res.sla.EMERGENCIA ?? res.sla.emergencia ?? slaEmergencia);
					slaUrgente = String(res.sla.URGENTE ?? res.sla.urgente ?? slaUrgente);
					slaPrioritaria = String(res.sla.PRIORITARIA ?? res.sla.prioritaria ?? slaPrioritaria);
					slaEletiva = String(res.sla.ELETIVA ?? res.sla.eletiva ?? slaEletiva);
				} else {
					slaEmergencia = String(res.slaEmergenciaHoras ?? res.slaEmergencia ?? slaEmergencia);
					slaUrgente = String(res.slaUrgenteHoras ?? res.slaUrgente ?? slaUrgente);
					slaPrioritaria = String(res.slaPrioritariaHoras ?? res.slaPrioritaria ?? slaPrioritaria);
					slaEletiva = String(res.slaEletivaHoras ?? res.slaEletiva ?? slaEletiva);
				}

				// 2. Senha
				if (res.senha) {
					senhaMin = String(res.senha.minComprimento ?? res.senha.minLen ?? senhaMin);
					senhaValidade = String(res.senha.validadeDias ?? res.senha.expiryDays ?? senhaValidade);
					senhaTentativas = String(res.senha.maxTentativas ?? res.senha.maxAttempts ?? senhaTentativas);
					senhaBloqueio = String(res.senha.bloqueioMinutos ?? res.senha.lockoutMins ?? senhaBloqueio);
					twoFA = Boolean(res.senha.twoFactorObrigatorio ?? res.senha.twoFa ?? twoFA);
				} else {
					senhaMin = String(res.senhaMinComprimento ?? res.senhaMin ?? senhaMin);
					senhaValidade = String(res.senhaValidadeDias ?? res.senhaValidade ?? senhaValidade);
					senhaTentativas = String(res.senhaMaxTentativas ?? res.senhaTentativas ?? senhaTentativas);
					senhaBloqueio = String(res.senhaBloqueioMinutos ?? res.senhaBloqueio ?? senhaBloqueio);
					twoFA = Boolean(res.twoFactorObrigatorio ?? res.twoFa ?? twoFA);
				}

				// 3. Uploads
				if (res.uploads) {
					uploadMaxArq = String(res.uploads.maxArquivoMb ?? res.uploads.maxFileMb ?? uploadMaxArq);
					uploadMaxReq = String(res.uploads.maxRequisicaoMb ?? res.uploads.maxRequestMb ?? uploadMaxReq);
					const mimes = res.uploads.mimesSuportados ?? res.uploads.mimes ?? [];
					uploadMimes = Array.isArray(mimes) ? mimes.join(', ') : String(mimes);
					uploadScan = Boolean(res.uploads.scanAtivo ?? res.uploads.scan ?? uploadScan);
				} else {
					uploadMaxArq = String(res.uploadMaxArquivoMb ?? res.uploadMaxArq ?? uploadMaxArq);
					uploadMaxReq = String(res.uploadMaxRequisicaoMb ?? res.uploadMaxReq ?? uploadMaxReq);
					const mimes = res.uploadMimesSuportados ?? res.uploadMimes ?? [];
					uploadMimes = Array.isArray(mimes) ? mimes.join(', ') : String(mimes);
					uploadScan = Boolean(res.uploadScanAtivo ?? res.uploadScan ?? uploadScan);
				}

				// 4. Retenção
				if (res.retencao) {
					retencaoEncaminhamentos = String(res.retencao.encaminhamentosAnos ?? res.retencao.referralsYears ?? retencaoEncaminhamentos);
					retencaoProntuario = String(res.retencao.prontuarioAnos ?? res.retencao.pecYears ?? retencaoProntuario);
					retencaoAudit = String(res.retencao.auditLogAnos ?? res.retencao.auditYears ?? retencaoAudit);
					retencaoSessoes = String(res.retencao.sessoesExpiradasDias ?? res.retencao.sessionsDays ?? retencaoSessoes);
				} else {
					retencaoEncaminhamentos = String(res.retencaoEncaminhamentosAnos ?? res.retencaoEncaminhamentos ?? retencaoEncaminhamentos);
					retencaoProntuario = String(res.retencaoProntuarioAnos ?? res.retencaoProntuario ?? retencaoProntuario);
					retencaoAudit = String(res.retencaoAuditLogAnos ?? res.retencaoAudit ?? retencaoAudit);
					retencaoSessoes = String(res.retencaoSessoesExpiradasDias ?? res.retencaoSessoes ?? retencaoSessoes);
				}
			}
		} catch (e: any) {
			console.error('Erro ao carregar configuracoes:', e);
			erro = 'Não foi possível carregar as configurações do servidor. Exibindo defaults.';
		} finally {
			carregando = false;
		}
	});

	async function salvar() {
		enviando = true;
		erro = '';
		sucessoMsg = '';
		try {
			const mimesArray = uploadMimes.split(',').map(m => m.trim().toLowerCase()).filter(Boolean);

			// Constrói payload híbrido (plano e aninhado) para compatibilidade garantida com qualquer spec de backend
			const payload = {
				// Estrutura aninhada
				sla: {
					EMERGENCIA: Number(slaEmergencia),
					URGENTE: Number(slaUrgente),
					PRIORITARIA: Number(slaPrioritaria),
					ELETIVA: Number(slaEletiva)
				},
				senha: {
					minComprimento: Number(senhaMin),
					validadeDias: Number(senhaValidade),
					maxTentativas: Number(senhaTentativas),
					bloqueioMinutos: Number(senhaBloqueio),
					twoFactorObrigatorio: Boolean(twoFA)
				},
				uploads: {
					maxArquivoMb: Number(uploadMaxArq),
					maxRequisicaoMb: Number(uploadMaxReq),
					mimesSuportados: mimesArray,
					scanAtivo: Boolean(uploadScan)
				},
				retencao: {
					encaminhamentosAnos: Number(retencaoEncaminhamentos),
					prontuarioAnos: Number(retencaoProntuario),
					auditLogAnos: Number(retencaoAudit),
					sessoesExpiradasDias: Number(retencaoSessoes)
				},

				// Estrutura plana
				slaEmergenciaHoras: Number(slaEmergencia),
				slaUrgenteHoras: Number(slaUrgente),
				slaPrioritariaHoras: Number(slaPrioritaria),
				slaEletivaHoras: Number(slaEletiva),
				senhaMinComprimento: Number(senhaMin),
				senhaValidadeDias: Number(senhaValidade),
				senhaMaxTentativas: Number(senhaTentativas),
				senhaBloqueioMinutos: Number(senhaBloqueio),
				twoFactorObrigatorio: Boolean(twoFA),
				uploadMaxArquivoMb: Number(uploadMaxArq),
				uploadMaxRequisicaoMb: Number(uploadMaxReq),
				uploadMimesSuportados: mimesArray,
				uploadScanAtivo: Boolean(uploadScan),
				retencaoEncaminhamentosAnos: Number(retencaoEncaminhamentos),
				retencaoProntuarioAnos: Number(retencaoProntuario),
				retencaoAuditLogAnos: Number(retencaoAudit),
				retencaoSessoesExpiradasDias: Number(retencaoSessoes)
			};

			await api.admin.updateConfiguracoes(payload);
			sucessoMsg = 'Parâmetros atualizados com sucesso!';
			setTimeout(() => { sucessoMsg = ''; }, 4000);
		} catch (e: any) {
			erro = e.message || 'Falha ao atualizar parâmetros.';
		} finally {
			enviando = false;
		}
	}
</script>

<section class="flex flex-col gap-4">
	{#if erro}
		<div class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-900 uppercase">
			⚠ {erro}
		</div>
	{/if}

	{#if sucessoMsg}
		<div class="border border-emerald-700 bg-emerald-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-emerald-900 uppercase">
			✓ {sucessoMsg}
		</div>
	{/if}

	<div class="border border-slate-200 bg-white">
		<PanelHeader
			title="Parâmetros Institucionais"
			subtitle="Configure os limites operacionais, SLAs e políticas globais da rede"
			index="02"
		>
			{#if podeEditar}
				<PrimaryButton
					label="Salvar Alterações"
					loading={enviando}
					onclick={salvar}
				/>
			{:else}
				<span class="border border-slate-300 bg-slate-50 px-2 py-1 font-mono text-[9px] tracking-widest text-slate-500 uppercase">
					Apenas Leitura
				</span>
			{/if}
		</PanelHeader>

		{#if carregando}
			<div class="flex items-center justify-center py-16">
				<div class="h-6 w-6 animate-spin border-2 border-slate-900 border-t-transparent"></div>
			</div>
		{:else}
			<div class="p-6 flex flex-col gap-8">
				
				<!-- Seção 1: SLAs -->
				<div>
					<h3 class="mb-3 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase border-b border-slate-200 pb-1">
						01. SLAs de Regulação (Horas)
					</h3>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
						<FormField
							label="Emergência"
							name="emergencia"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={slaEmergencia}
							hint="horas"
						/>
						<FormField
							label="Urgente"
							name="urgente"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={slaUrgente}
							hint="horas"
						/>
						<FormField
							label="Prioritária"
							name="prioritaria"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={slaPrioritaria}
							hint="horas"
						/>
						<FormField
							label="Eletiva"
							name="eletiva"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={slaEletiva}
							hint="horas"
						/>
					</div>
				</div>

				<!-- Seção 2: Políticas de Senha -->
				<div>
					<h3 class="mb-3 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase border-b border-slate-200 pb-1">
						02. Segurança e Contas de Usuários
					</h3>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-12">
						<FormField
							label="Comprimento Mínimo"
							name="senhaMin"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={senhaMin}
							hint="caracteres"
						/>
						<FormField
							label="Validade da Senha"
							name="senhaValidade"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={senhaValidade}
							hint="dias"
						/>
						<FormField
							label="Tentativas de Login"
							name="senhaTentativas"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={senhaTentativas}
							hint="máximo falhas"
						/>
						<FormField
							label="Tempo de Bloqueio"
							name="senhaBloqueio"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={senhaBloqueio}
							hint="minutos"
						/>
						
						<div class="col-span-12 flex items-center pt-2">
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									disabled={!podeEditar}
									bind:checked={twoFA}
									class="h-4 w-4 accent-slate-950"
								/>
								<span class="font-mono text-[10px] font-semibold tracking-widest text-slate-700 uppercase">
									Exigir 2FA obrigatório para ADMIN e REGULADOR_SMS
								</span>
							</label>
						</div>
					</div>
				</div>

				<!-- Seção 3: Uploads -->
				<div>
					<h3 class="mb-3 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase border-b border-slate-200 pb-1">
						03. Upload e Segurança de Anexos
					</h3>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-12">
						<FormField
							label="Tamanho por Arquivo"
							name="uploadMaxArq"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={uploadMaxArq}
							hint="MB"
						/>
						<FormField
							label="Tamanho por Requisição"
							name="uploadMaxReq"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={uploadMaxReq}
							hint="MB total"
						/>
						<FormField
							label="MIMEs Permitidos"
							name="uploadMimes"
							type="text"
							readonly={!podeEditar}
							span={6}
							bind:value={uploadMimes}
							hint="separados por vírgula"
						/>

						<div class="col-span-12 flex items-center pt-2">
							<label class="flex items-center gap-2 cursor-pointer">
								<input
									type="checkbox"
									disabled={!podeEditar}
									bind:checked={uploadScan}
									class="h-4 w-4 accent-slate-950"
								/>
								<span class="font-mono text-[10px] font-semibold tracking-widest text-slate-700 uppercase">
									Executar scan assíncrono de antivírus nos anexos (ClamAV)
								</span>
							</label>
						</div>
					</div>
				</div>

				<!-- Seção 4: Retenção LGPD -->
				<div>
					<h3 class="mb-3 font-mono text-xs font-bold tracking-widest text-slate-900 uppercase border-b border-slate-200 pb-1">
						04. Prazos de Retenção (LGPD)
					</h3>
					<div class="grid grid-cols-1 gap-4 md:grid-cols-4">
						<FormField
							label="Encaminhamentos"
							name="retencaoEncaminhamentos"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={retencaoEncaminhamentos}
							hint="anos"
						/>
						<FormField
							label="Prontuário (PEC)"
							name="retencaoProntuario"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={retencaoProntuario}
							hint="anos (999=vitalício)"
						/>
						<FormField
							label="Logs de Auditoria"
							name="retencaoAudit"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={retencaoAudit}
							hint="anos"
						/>
						<FormField
							label="Sessões Expiradas"
							name="retencaoSessoes"
							type="number"
							readonly={!podeEditar}
							span={3}
							bind:value={retencaoSessoes}
							hint="dias"
						/>
					</div>
				</div>

			</div>
		{/if}
	</div>
</section>
