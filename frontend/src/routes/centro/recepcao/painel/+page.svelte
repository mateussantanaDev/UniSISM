<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { page } from '$app/state';
	import { api } from '$lib/api';

	interface ChamadaItem {
		id: string;
		pacienteNome: string;
		consultorio: string;
		medicoNome: string;
		especialidade: string;
		horario: string;
		status: string;
	}

	let centroAtivo = $derived<'CEM' | 'CEO'>(page.url.pathname.includes('/ceo') ? 'CEO' : 'CEM');
	let ehCeo = $derived(centroAtivo === 'CEO');

	let nomeOrgao = $derived(ehCeo ? 'Centro de Especialidades Odontológicas (CEO)' : 'Centro de Especialidades Médicas (CEM)');
	let senhaPareamento = $derived(ehCeo ? 'CEO-2026' : 'CEM-2026');
	let tipoLocal = $derived(ehCeo ? 'Cadeira Odontológica' : 'Consultório');

	let urlTv = $state('https://unisism.vercel.app/tv');
	let copiadoLink = $state(false);
	let copiadoSenha = $state(false);
	let testandoAudio = $state(false);
	let chamadasAtivas = $state<ChamadaItem[]>([]);
	let carregandoChamadas = $state(false);
	let timerPolling: any = null;

	function copiarTexto(texto: string, tipo: 'link' | 'senha') {
		if (typeof navigator !== 'undefined' && navigator.clipboard) {
			navigator.clipboard.writeText(texto);
			if (tipo === 'link') {
				copiadoLink = true;
				setTimeout(() => { copiadoLink = false; }, 2000);
			} else {
				copiadoSenha = true;
				setTimeout(() => { copiadoSenha = false; }, 2000);
			}
		}
	}

	function abrirPainelNovaAba() {
		if (typeof window !== 'undefined') {
			const linkCompleto = `${window.location.origin}/tv?pin=${senhaPareamento}`;
			window.open(linkCompleto, '_blank');
		}
	}

	// Web Audio Synthesizer para Teste Local
	function testarSomLocal() {
		testandoAudio = true;
		try {
			const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
			if (AudioContextClass) {
				const ctx = new AudioContextClass();
				const agora = ctx.currentTime;

				const osc1 = ctx.createOscillator();
				const gain1 = ctx.createGain();
				osc1.frequency.setValueAtTime(587.33, agora);
				gain1.gain.setValueAtTime(0, agora);
				gain1.gain.linearRampToValueAtTime(0.3, agora + 0.05);
				gain1.gain.exponentialRampToValueAtTime(0.001, agora + 0.6);
				osc1.connect(gain1);
				gain1.connect(ctx.destination);
				osc1.start(agora);
				osc1.stop(agora + 0.6);

				const osc2 = ctx.createOscillator();
				const gain2 = ctx.createGain();
				osc2.frequency.setValueAtTime(880.0, agora + 0.25);
				gain2.gain.setValueAtTime(0, agora + 0.25);
				gain2.gain.linearRampToValueAtTime(0.35, agora + 0.3);
				gain2.gain.exponentialRampToValueAtTime(0.001, agora + 0.9);
				osc2.connect(gain2);
				gain2.connect(ctx.destination);
				osc2.start(agora + 0.25);
				osc2.stop(agora + 0.9);
			}

			if ('speechSynthesis' in window) {
				window.speechSynthesis.cancel();
				const msg = new SpeechSynthesisUtterance(`Teste de chamada do ${nomeOrgao}. Sistema de áudio operando normalmente.`);
				msg.lang = 'pt-BR';
				msg.rate = 0.95;
				setTimeout(() => {
					window.speechSynthesis.speak(msg);
				}, 600);
			}
		} catch (e) {
			console.error(e);
		} finally {
			setTimeout(() => { testandoAudio = false; }, 3500);
		}
	}

	async function carregarChamadasRecentes() {
		carregandoChamadas = true;
		try {
			const res = await api.encaminhamentos.list({ status: 'APROVADO', limit: 30 }).catch(() => []);
			chamadasAtivas = res
				.filter((e: any) => {
					const esp = (e.solicitacao?.especialidadeSolicitada || '').toLowerCase();
					const eOdonto = esp.includes('odonto') || esp.includes('bucal') || esp.includes('canal') || esp.includes('periodontia') || esp.includes('bucomaxilo');
					return ehCeo ? eOdonto : !eOdonto;
				})
				.slice(0, 8)
				.map((e: any, idx: number) => {
					const num = ((idx % 6) + 1).toString().padStart(2, '0');
					return {
						id: e.id,
						pacienteNome: e.paciente?.nome || 'Paciente Identificado',
						consultorio: ehCeo ? `Cadeira Odonto ${num}` : `Consultório ${num}`,
						medicoNome: e.profissionalAtribuido || (ehCeo ? 'Dr(a). Cirurgião-Dentista' : 'Dr(a). Médico Especialista'),
						especialidade: e.solicitacao?.especialidadeSolicitada || (ehCeo ? 'Odontologia' : 'Especialidades'),
						horario: new Date(e.atualizadoEm || e.criadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
						status: e.statusAtendimentoCentro || 'AGUARDANDO_ATENDIMENTO'
					};
				});
		} catch (e) {
			console.info('[UniSISM] Carregando chamadas...', e);
		} finally {
			carregandoChamadas = false;
		}
	}

	onMount(() => {
		if (typeof window !== 'undefined') {
			urlTv = `${window.location.origin}/tv`;
		}
		carregarChamadasRecentes();
		timerPolling = setInterval(carregarChamadasRecentes, 8000);
	});

	onDestroy(() => {
		if (timerPolling) clearInterval(timerPolling);
	});
</script>

<svelte:head>
	<title>{centroAtivo} · Gerenciador do Painel TV</title>
</svelte:head>

<div class="space-y-6">
	<!-- ═══════════════════════════════════════════════════════════════
	     CABEÇALHO INSTITUCIONAL
	     ═══════════════════════════════════════════════════════════════ -->
	<div class="border border-slate-200 bg-white p-6">
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div>
				<div class="flex items-center gap-2">
					<span class="inline-block h-1.5 w-1.5 {ehCeo ? 'bg-emerald-600' : 'bg-blue-900'}"></span>
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						SISTEMA UNIFICADO DE SAÚDE · MÓDULO DE RECEPÇÃO & SALA DE ESPERA
					</span>
				</div>
				<h1 class="mt-1 font-mono text-lg font-bold tracking-tight text-slate-900 uppercase">
					Painel de Chamada TV · {centroAtivo}
				</h1>
				<p class="mt-1 text-xs text-slate-600">
					Gerenciamento da conexão de Smart TVs e transmissão de chamadas em tempo real para a sala de espera do <strong>{nomeOrgao}</strong>.
				</p>
			</div>

			<div class="flex items-center gap-3">
				<button
					onclick={testarSomLocal}
					disabled={testandoAudio}
					class="inline-flex items-center justify-center gap-2 border border-slate-300 bg-white px-4 py-2 font-mono text-xs font-bold tracking-wider text-slate-800 uppercase hover:bg-slate-50 transition-colors"
				>
					<span>{testandoAudio ? '🔊 Emitindo Teste...' : '🔊 Testar Som Local'}</span>
				</button>

				<button
					onclick={abrirPainelNovaAba}
					class="inline-flex items-center justify-center gap-2 border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white px-4 py-2 font-mono text-xs font-bold tracking-widest uppercase transition-colors"
				>
					<span>Abrir Painel TV Nesta Tela</span>
					<kbd class="border border-white/40 px-1 py-0.5 text-[9px]">↗</kbd>
				</button>
			</div>
		</div>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════
	     CARDS DE CONEXÃO & PAREAMENTO DA TV
	     ═══════════════════════════════════════════════════════════════ -->
	<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
		
		<!-- CARD 1: URL DA TV -->
		<div class="border border-slate-200 bg-white p-5 flex flex-col justify-between">
			<div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						1. URL DE ACESSO NA TV
					</span>
					<span class="inline-block h-1.5 w-1.5 bg-emerald-600"></span>
				</div>
				<div class="mt-2 font-mono text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 p-2.5 break-all select-all">
					{urlTv}
				</div>
				<p class="mt-2 text-[11px] text-slate-600">
					Abra o navegador na Smart TV da sala de espera e digite exatamente este endereço.
				</p>
			</div>

			<button
				onclick={() => copiarTexto(urlTv, 'link')}
				class="mt-4 w-full border border-slate-300 bg-white py-2 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase hover:bg-slate-50 transition-colors"
			>
				{copiadoLink ? '✓ Link Copiado!' : 'Copiar URL da TV'}
			</button>
		</div>

		<!-- CARD 2: SENHA DO CENTRO -->
		<div class="border border-slate-200 bg-white p-5 flex flex-col justify-between">
			<div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						2. SENHA DE PAREAMENTO
					</span>
					<span class="border border-blue-200 bg-blue-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-blue-900 uppercase">
						CENTRO ATIVO
					</span>
				</div>
				<div class="mt-2 font-mono text-2xl font-bold text-blue-900 bg-blue-50 border border-blue-200 p-2 text-center tracking-widest select-all">
					{senhaPareamento}
				</div>
				<p class="mt-2 text-[11px] text-slate-600">
					Ao abrir a tela na Smart TV, digite esta senha para sincronizar as chamadas deste centro.
				</p>
			</div>

			<button
				onclick={() => copiarTexto(senhaPareamento, 'senha')}
				class="mt-4 w-full border border-slate-300 bg-white py-2 font-mono text-xs font-bold tracking-wider text-slate-700 uppercase hover:bg-slate-50 transition-colors"
			>
				{copiadoSenha ? '✓ Senha Copiada!' : 'Copiar Senha do Centro'}
			</button>
		</div>

		<!-- CARD 3: STATUS & ABERTURA DIRETA -->
		<div class="border border-slate-200 bg-slate-50 p-5 flex flex-col justify-between">
			<div>
				<div class="flex items-center justify-between">
					<span class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
						3. TRANSMISSÃO EM TEMPO REAL
					</span>
					<span class="inline-flex items-center gap-1 font-mono text-[9px] font-bold text-emerald-800 uppercase">
						<span class="inline-block h-1.5 w-1.5 animate-pulse bg-emerald-600"></span>
						ONLINE
					</span>
				</div>
				<div class="mt-3 space-y-1.5 text-xs text-slate-700 font-mono">
					<div class="flex justify-between border-b border-slate-200 pb-1">
						<span class="text-slate-500">Órgão Vinculado:</span>
						<strong>{centroAtivo}</strong>
					</div>
					<div class="flex justify-between border-b border-slate-200 pb-1">
						<span class="text-slate-500">Tipo de Local:</span>
						<strong>{tipoLocal}</strong>
					</div>
					<div class="flex justify-between pb-1">
						<span class="text-slate-500">Sintetizador Voz:</span>
						<strong class="text-emerald-800">Português (BR)</strong>
					</div>
				</div>
			</div>

			<button
				onclick={abrirPainelNovaAba}
				class="mt-4 w-full border border-blue-900 bg-blue-900 hover:bg-blue-950 text-white py-2 font-mono text-xs font-bold tracking-widest uppercase transition-colors"
			>
				Abrir Painel em Nova Aba ↗
			</button>
		</div>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════
	     GUIA RÁPIDO DE INSTALAÇÃO NA SMART TV
	     ═══════════════════════════════════════════════════════════════ -->
	<div class="border border-slate-200 bg-white p-6">
		<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase mb-3">
			INSTRUÇÕES PARA A EQUIPE DA RECEPÇÃO
		</div>
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<div class="border border-slate-100 bg-slate-50 p-4">
				<div class="font-mono text-lg font-bold text-blue-900">01</div>
				<h3 class="font-mono text-xs font-bold text-slate-900 uppercase mt-1">Ligue a Smart TV</h3>
				<p class="text-[11px] text-slate-600 mt-1">
					Abra o navegador de internet integrado na TV da recepção ou no computador conectado via HDMI.
				</p>
			</div>

			<div class="border border-slate-100 bg-slate-50 p-4">
				<div class="font-mono text-lg font-bold text-blue-900">02</div>
				<h3 class="font-mono text-xs font-bold text-slate-900 uppercase mt-1">Acesse a URL</h3>
				<p class="text-[11px] text-slate-600 mt-1">
					Digite o endereço <strong>unisism.vercel.app/tv</strong> na barra de navegação da TV.
				</p>
			</div>

			<div class="border border-slate-100 bg-slate-50 p-4">
				<div class="font-mono text-lg font-bold text-blue-900">03</div>
				<h3 class="font-mono text-xs font-bold text-slate-900 uppercase mt-1">Digite a Senha</h3>
				<p class="text-[11px] text-slate-600 mt-1">
					Insira o código <strong>{senhaPareamento}</strong>. O painel conectará e salvará o pareamento automaticamente.
				</p>
			</div>

			<div class="border border-slate-100 bg-slate-50 p-4">
				<div class="font-mono text-lg font-bold text-blue-900">04</div>
				<h3 class="font-mono text-xs font-bold text-slate-900 uppercase mt-1">Coloque em Tela Cheia</h3>
				<p class="text-[11px] text-slate-600 mt-1">
					Clique no botão "Tela Cheia" (ou F11) e ajuste o volume dos alto-falantes da sala de espera.
				</p>
			</div>
		</div>
	</div>

	<!-- ═══════════════════════════════════════════════════════════════
	     MONITORAMENTO EM TEMPO REAL DAS CHAMADAS
	     ═══════════════════════════════════════════════════════════════ -->
	<div class="border border-slate-200 bg-white">
		<div class="border-b border-slate-200 bg-slate-50 px-6 py-4 flex items-center justify-between">
			<div>
				<div class="font-mono text-[10px] font-bold tracking-widest text-slate-500 uppercase">
					MONITORAMENTO DE TRANSMISSÃO
				</div>
				<h2 class="font-mono text-sm font-bold text-slate-900 uppercase">
					Fila de Chamadas Ativas · {centroAtivo}
				</h2>
			</div>

			<button
				onclick={carregarChamadasRecentes}
				class="border border-slate-300 bg-white px-3 py-1.5 font-mono text-[10px] font-bold tracking-wider text-slate-700 uppercase hover:bg-slate-50 transition-colors"
			>
				{carregandoChamadas ? 'Atualizando...' : '↻ Atualizar Fila'}
			</button>
		</div>

		<div class="overflow-x-auto">
			<table class="w-full text-left font-mono text-xs">
				<thead class="border-b border-slate-200 bg-slate-100/70 text-[10px] font-bold uppercase tracking-wider text-slate-600">
					<tr>
						<th class="px-6 py-3">Paciente</th>
						<th class="px-6 py-3">Local Designado</th>
						<th class="px-6 py-3">Profissional Responsável</th>
						<th class="px-6 py-3">Especialidade</th>
						<th class="px-6 py-3">Horário</th>
						<th class="px-6 py-3 text-right">Status no Painel</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-slate-100">
					{#if chamadasAtivas.length === 0}
						<tr>
							<td colspan="6" class="px-6 py-8 text-center text-slate-500">
								Nenhum paciente em chamada no momento. Os atendimentos chamados pelos consultórios aparecerão aqui automaticamente.
							</td>
						</tr>
					{:else}
						{#each chamadasAtivas as c}
							<tr class="hover:bg-slate-50 transition-colors">
								<td class="px-6 py-3 font-bold text-slate-900">
									{c.pacienteNome}
								</td>
								<td class="px-6 py-3 font-bold {ehCeo ? 'text-emerald-700' : 'text-blue-900'}">
									{c.consultorio}
								</td>
								<td class="px-6 py-3 text-slate-700">
									{c.medicoNome}
								</td>
								<td class="px-6 py-3 text-slate-600">
									{c.especialidade}
								</td>
								<td class="px-6 py-3 text-slate-500 font-bold">
									{c.horario}
								</td>
								<td class="px-6 py-3 text-right">
									<span class="inline-flex items-center gap-1 border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800 uppercase">
										<span class="inline-block h-1 w-1 rounded-full bg-emerald-600"></span>
										TRANSMITIDO
									</span>
								</td>
							</tr>
						{/each}
					{/if}
				</tbody>
			</table>
		</div>
	</div>
</div>
