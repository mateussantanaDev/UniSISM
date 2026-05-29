<script lang="ts">
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import { api, ApiError } from '$lib/api';
	import type { AdminBanner, BannerTone } from '$lib/api/types';
	import { onMount } from 'svelte';
	import { useAuth } from '$lib/presentation/contexts/authContext';

	const auth = useAuth();
	const ehDev = $derived(auth.me?.role === 'DESENVOLVEDOR');

	/**
	 * CRUD admin de Banners SMS — alimenta o carrossel "Avisos da Secretaria"
	 * no app paciente (Face 3).
	 *
	 * RBAC: DEV global · ADMIN/REGULADOR_SMS limitado à própria prefeitura.
	 */

	const TONES: ReadonlyArray<{ value: BannerTone; label: string; cor: string }> = [
		{ value: 'URGENTE', label: 'Urgente', cor: 'red' },
		{ value: 'CAMPANHA', label: 'Campanha', cor: 'emerald' },
		{ value: 'INFO', label: 'Informativo', cor: 'blue' },
		{ value: 'ATENCAO', label: 'Atenção', cor: 'amber' }
	];

	const TONE_BORDA: Record<BannerTone, string> = {
		URGENTE: 'border-red-700',
		CAMPANHA: 'border-emerald-700',
		INFO: 'border-blue-700',
		ATENCAO: 'border-amber-600'
	};

	const TONE_BG: Record<BannerTone, string> = {
		URGENTE: 'bg-red-50',
		CAMPANHA: 'bg-emerald-50',
		INFO: 'bg-blue-50',
		ATENCAO: 'bg-amber-50'
	};

	let lista = $state<AdminBanner[]>([]);
	let carregando = $state(true);
	let erro = $state('');

	// Filtros
	let filtroAtivo = $state<'todos' | 'true' | 'false'>('true');
	let filtroExpirados = $state<'todos' | 'true' | 'false'>('false');

	// Form state (modo create/edit no mesmo painel)
	let editandoId = $state<string | null>(null);
	let formTitulo = $state('');
	let formCorpo = $state('');
	let formTone = $state<BannerTone>('INFO');
	let formPublicadoEm = $state(''); // datetime-local
	let formExpiraEm = $state('');
	let formImagemUrl = $state('');
	let formCtaLabel = $state('');
	let formCtaUrl = $state('');
	let formPrioridadeOrdem = $state(0);
	let formAtivo = $state(true);
	let formPrefGlobal = $state(false); // só DEV pode setar
	let salvando = $state(false);
	let formErro = $state('');

	function dateToInput(s: string | null | undefined): string {
		if (!s) return '';
		const d = new Date(s);
		if (Number.isNaN(d.getTime())) return '';
		const yyyy = d.getFullYear();
		const mm = String(d.getMonth() + 1).padStart(2, '0');
		const dd = String(d.getDate()).padStart(2, '0');
		const hh = String(d.getHours()).padStart(2, '0');
		const mi = String(d.getMinutes()).padStart(2, '0');
		return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
	}

	function inputToIso(v: string): string | null {
		if (!v) return null;
		const d = new Date(v);
		if (Number.isNaN(d.getTime())) return null;
		return d.toISOString();
	}

	async function carregar() {
		erro = '';
		carregando = true;
		try {
			const q: { ativo?: boolean; expirados?: boolean } = {};
			if (filtroAtivo !== 'todos') q.ativo = filtroAtivo === 'true';
			if (filtroExpirados !== 'todos') q.expirados = filtroExpirados === 'true';
			lista = await api.admin.listBanners(q);
		} catch (e) {
			erro = e instanceof ApiError ? e.message : 'Falha ao carregar.';
		} finally {
			carregando = false;
		}
	}

	onMount(carregar);
	$effect(() => {
		void filtroAtivo;
		void filtroExpirados;
		void carregar();
	});

	function abrirNovo() {
		editandoId = null;
		formTitulo = '';
		formCorpo = '';
		formTone = 'INFO';
		formPublicadoEm = dateToInput(new Date().toISOString());
		formExpiraEm = '';
		formImagemUrl = '';
		formCtaLabel = '';
		formCtaUrl = '';
		formPrioridadeOrdem = 0;
		formAtivo = true;
		formPrefGlobal = false;
		formErro = '';
	}

	function abrirEditar(b: AdminBanner) {
		editandoId = b.id;
		formTitulo = b.titulo;
		formCorpo = b.corpo;
		formTone = b.tone;
		formPublicadoEm = dateToInput(b.publicadoEm);
		formExpiraEm = dateToInput(b.expiraEm);
		formImagemUrl = b.imagemUrl ?? '';
		formCtaLabel = b.ctaLabel ?? '';
		formCtaUrl = b.ctaUrl ?? '';
		formPrioridadeOrdem = b.prioridadeOrdem;
		formAtivo = b.ativo;
		formPrefGlobal = b.prefeituraId === null;
		formErro = '';
	}

	function cancelarForm() {
		editandoId = null;
		formErro = '';
	}

	function validarLocal(): string | null {
		const t = formTitulo.trim();
		const c = formCorpo.trim();
		if (t.length < 3 || t.length > 80) return 'Título: 3 a 80 caracteres.';
		if (c.length < 3 || c.length > 400) return 'Corpo: 3 a 400 caracteres.';
		if (formImagemUrl && !/^https:\/\//i.test(formImagemUrl)) {
			return 'imagemUrl: deve começar com https:// (Android bloqueia http://).';
		}
		if (formCtaUrl && !/^https:\/\//i.test(formCtaUrl)) {
			return 'ctaUrl: deve começar com https://.';
		}
		const temLabel = formCtaLabel.trim().length > 0;
		const temUrl = formCtaUrl.trim().length > 0;
		if (temLabel !== temUrl) return 'ctaLabel e ctaUrl devem vir juntos (ou ambos vazios).';
		if (formExpiraEm) {
			const pub = inputToIso(formPublicadoEm);
			const exp = inputToIso(formExpiraEm);
			if (pub && exp && new Date(exp).getTime() <= new Date(pub).getTime()) {
				return 'Expiração deve ser após a publicação.';
			}
		}
		if (formPrioridadeOrdem < -100 || formPrioridadeOrdem > 1000) {
			return 'Prioridade: -100 a 1000.';
		}
		return null;
	}

	async function salvar() {
		formErro = '';
		const motivo = validarLocal();
		if (motivo) {
			formErro = motivo;
			return;
		}
		salvando = true;
		try {
			if (editandoId) {
				await api.admin.updateBanner(editandoId, {
					titulo: formTitulo.trim(),
					corpo: formCorpo.trim(),
					tone: formTone,
					publicadoEm: inputToIso(formPublicadoEm) ?? undefined,
					expiraEm: formExpiraEm ? inputToIso(formExpiraEm) : null,
					imagemUrl: formImagemUrl.trim() || null,
					ctaLabel: formCtaLabel.trim() || null,
					ctaUrl: formCtaUrl.trim() || null,
					prioridadeOrdem: formPrioridadeOrdem,
					ativo: formAtivo
				});
			} else {
				const payload: import('$lib/api/types').CriarBannerRequest = {
					titulo: formTitulo.trim(),
					corpo: formCorpo.trim(),
					tone: formTone,
					...(formPublicadoEm ? { publicadoEm: inputToIso(formPublicadoEm)! } : {}),
					...(formExpiraEm ? { expiraEm: inputToIso(formExpiraEm) } : {}),
					...(formImagemUrl.trim() ? { imagemUrl: formImagemUrl.trim() } : {}),
					...(formCtaLabel.trim() ? { ctaLabel: formCtaLabel.trim() } : {}),
					...(formCtaUrl.trim() ? { ctaUrl: formCtaUrl.trim() } : {}),
					prioridadeOrdem: formPrioridadeOrdem
				};
				// Apenas DEV pode setar prefeituraId=null (global). ADMIN/REG → backend usa scope.
				if (ehDev && formPrefGlobal) {
					payload.prefeituraId = null;
				}
				await api.admin.createBanner(payload);
			}
			await carregar();
			cancelarForm();
		} catch (e) {
			if (e instanceof ApiError) {
				if (e.code === 'FORA_DO_ESCOPO') {
					formErro = 'Você não tem permissão para este banner.';
				} else if (e.code === 'VALIDATION_ERROR') {
					formErro = e.message;
				} else {
					formErro = e.message;
				}
			} else {
				formErro = 'Falha ao salvar.';
			}
		} finally {
			salvando = false;
		}
	}

	async function deletar(b: AdminBanner) {
		if (
			!confirm(
				`Excluir banner "${b.titulo}"?\n\nTelemetria será apagada (${b.totalVisualizacoes} visualizações).`
			)
		) {
			return;
		}
		try {
			await api.admin.deleteBanner(b.id);
			await carregar();
		} catch (e) {
			if (e instanceof ApiError) erro = e.message;
		}
	}

	function formatDate(s: string | null): string {
		if (!s) return '—';
		return new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
	}

	function expirado(b: AdminBanner): boolean {
		if (!b.expiraEm) return false;
		return new Date(b.expiraEm).getTime() < Date.now();
	}
</script>

<div class="flex flex-col gap-4">
	<!-- Header explicativo -->
	<section class="border border-slate-200 bg-white p-4">
		<h2 class="font-mono text-xs font-bold tracking-widest text-slate-700 uppercase">
			Banners SMS — Carrossel da Home
		</h2>
		<p class="mt-1 text-sm text-slate-600">
			Avisos exibidos no topo do app paciente. Use tons (URGENTE/CAMPANHA/INFO/ATENÇÃO)
			para destacar prioridades. Toda mudança é auditada.
			{#if ehDev}
				<br /><span class="font-mono text-[10px] tracking-widest text-blue-900 uppercase">
					Você (DEV) pode criar banners globais (todas prefeituras).
				</span>
			{:else}
				<br /><span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
					Banners criados aqui são vistos só por pacientes da sua prefeitura.
				</span>
			{/if}
		</p>
	</section>

	<!-- Form criar/editar -->
	<section class="border border-slate-200 bg-white">
		<PanelHeader
			title={editandoId ? 'Editar banner' : 'Novo banner'}
			index="01"
		/>
		<div class="grid grid-cols-12 gap-3 p-4">
			<div class="col-span-12 flex flex-col md:col-span-8">
				<label
					for="banner-titulo"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Título (3-80 chars)
				</label>
				<input
					id="banner-titulo"
					type="text"
					maxlength="80"
					bind:value={formTitulo}
					placeholder="Ex.: Vacinação contra a Influenza"
					class="w-full border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>
			<div class="col-span-12 flex flex-col md:col-span-4">
				<label
					for="banner-tone"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Tom visual
				</label>
				<select
					id="banner-tone"
					bind:value={formTone}
					class="w-full border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				>
					{#each TONES as t}
						<option value={t.value}>{t.label}</option>
					{/each}
				</select>
			</div>

			<div class="col-span-12 flex flex-col">
				<label
					for="banner-corpo"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Corpo (3-400 chars)
				</label>
				<textarea
					id="banner-corpo"
					rows="3"
					maxlength="400"
					bind:value={formCorpo}
					placeholder="Texto que aparece no card / modal expandido."
					class="w-full resize-none border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				></textarea>
				<div class="mt-1 text-right font-mono text-[10px] text-slate-500">
					{formCorpo.length}/400
				</div>
			</div>

			<div class="col-span-12 flex flex-col md:col-span-6">
				<label
					for="banner-pub"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Publicado em
				</label>
				<input
					id="banner-pub"
					type="datetime-local"
					bind:value={formPublicadoEm}
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>
			<div class="col-span-12 flex flex-col md:col-span-6">
				<label
					for="banner-exp"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Expira em (opcional)
				</label>
				<input
					id="banner-exp"
					type="datetime-local"
					bind:value={formExpiraEm}
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>

			<div class="col-span-12 flex flex-col">
				<label
					for="banner-img"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Imagem (HTTPS opcional)
				</label>
				<input
					id="banner-img"
					type="url"
					maxlength="500"
					bind:value={formImagemUrl}
					placeholder="https://cdn.aguasbelas.pe.gov.br/banners/influenza-2026.jpg"
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
				<div class="mt-1 text-[10px] tracking-wider text-slate-500 uppercase">
					Apenas https:// — Android bloqueia http://
				</div>
			</div>

			<div class="col-span-12 flex flex-col md:col-span-5">
				<label
					for="banner-cta-label"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Botão CTA (texto · ≤30)
				</label>
				<input
					id="banner-cta-label"
					type="text"
					maxlength="30"
					bind:value={formCtaLabel}
					placeholder="Ver detalhes"
					class="w-full border border-slate-300 bg-white px-3 py-2 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>
			<div class="col-span-12 flex flex-col md:col-span-7">
				<label
					for="banner-cta-url"
					class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
				>
					Botão CTA (URL · HTTPS)
				</label>
				<input
					id="banner-cta-url"
					type="url"
					maxlength="500"
					bind:value={formCtaUrl}
					placeholder="https://aguasbelas.pe.gov.br/saude/campanha"
					class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
				/>
			</div>

			<div class="col-span-12 flex items-end gap-3 md:col-span-6">
				<div class="flex flex-1 flex-col">
					<label
						for="banner-prio"
						class="mb-1 font-mono text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
					>
						Prioridade (maior = topo)
					</label>
					<input
						id="banner-prio"
						type="number"
						min="-100"
						max="1000"
						step="1"
						bind:value={formPrioridadeOrdem}
						class="w-full border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
					/>
				</div>
				{#if editandoId}
					<label class="flex items-center gap-2 pb-2">
						<input type="checkbox" bind:checked={formAtivo} class="h-4 w-4" />
						<span class="font-mono text-xs tracking-wider text-slate-700 uppercase">Ativo</span>
					</label>
				{/if}
			</div>
			{#if !editandoId && ehDev}
				<div class="col-span-12 flex items-end md:col-span-6">
					<label class="flex items-center gap-2">
						<input type="checkbox" bind:checked={formPrefGlobal} class="h-4 w-4" />
						<span class="font-mono text-xs tracking-wider text-slate-700 uppercase">
							Banner GLOBAL (todas as prefeituras)
						</span>
					</label>
				</div>
			{/if}

			{#if formErro}
				<div
					class="col-span-12 border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
				>
					⚠ {formErro}
				</div>
			{/if}

			<div class="col-span-12 flex justify-end gap-2 border-t border-slate-200 pt-4">
				{#if editandoId}
					<PrimaryButton label="Cancelar" variant="secondary" onclick={cancelarForm} />
				{:else}
					<PrimaryButton label="Limpar" variant="secondary" onclick={abrirNovo} />
				{/if}
				<PrimaryButton
					label={editandoId ? 'Salvar alterações' : 'Criar banner'}
					loading={salvando}
					onclick={salvar}
				/>
			</div>
		</div>
	</section>

	<!-- Filtros + Lista -->
	<section class="border border-slate-200 bg-white">
		<PanelHeader title="Banners existentes" index="02" />
		<div class="border-b border-slate-200 bg-slate-50 px-4 py-3">
			<div class="flex flex-wrap items-center gap-3 font-mono text-[11px] text-slate-700">
				<span class="font-bold tracking-widest uppercase">Filtros:</span>
				<label class="flex items-center gap-1.5">
					<span class="text-[10px] uppercase">Status:</span>
					<select bind:value={filtroAtivo} class="border border-slate-300 bg-white px-2 py-1 text-xs">
						<option value="todos">todos</option>
						<option value="true">ativos</option>
						<option value="false">inativos</option>
					</select>
				</label>
				<label class="flex items-center gap-1.5">
					<span class="text-[10px] uppercase">Validade:</span>
					<select bind:value={filtroExpirados} class="border border-slate-300 bg-white px-2 py-1 text-xs">
						<option value="todos">todos</option>
						<option value="false">não expirados</option>
						<option value="true">expirados</option>
					</select>
				</label>
			</div>
		</div>

		{#if carregando}
			<div class="p-4 text-sm text-slate-500">Carregando...</div>
		{:else if erro}
			<div class="p-4 text-sm text-red-700">{erro}</div>
		{:else if lista.length === 0}
			<div class="p-4 text-sm text-slate-500">
				Nenhum banner com esses filtros. Crie um acima.
			</div>
		{:else}
			<ul class="divide-y divide-slate-200">
				{#each lista as b (b.id)}
					<li
						class="p-4 transition hover:bg-slate-50"
						class:opacity-50={!b.ativo}
					>
						<div class="flex items-start justify-between gap-3">
							<div class="flex-1">
								<div class="flex items-center gap-2">
									<div
										class="border-l-4 {TONE_BORDA[b.tone]} {TONE_BG[b.tone]} px-2 py-0.5 font-mono text-[9px] font-bold tracking-widest uppercase"
									>
										{b.tone}
									</div>
									{#if !b.ativo}
										<span class="font-mono text-[10px] tracking-widest text-slate-500 uppercase">
											· INATIVO
										</span>
									{/if}
									{#if expirado(b)}
										<span class="font-mono text-[10px] tracking-widest text-red-700 uppercase">
											· EXPIRADO
										</span>
									{/if}
									{#if b.prefeituraId === null}
										<span
											class="font-mono text-[9px] font-bold tracking-widest text-blue-900 uppercase"
										>
											· GLOBAL
										</span>
									{/if}
								</div>
								<div class="mt-1 font-sans text-sm font-bold text-slate-900">{b.titulo}</div>
								<div class="mt-0.5 line-clamp-2 font-sans text-xs text-slate-600">
									{b.corpo}
								</div>
								<div class="mt-2 flex flex-wrap items-center gap-3 font-mono text-[10px] tracking-wider text-slate-500 uppercase">
									<span>Pub: {formatDate(b.publicadoEm)}</span>
									{#if b.expiraEm}
										<span>Exp: {formatDate(b.expiraEm)}</span>
									{/if}
									<span>Pri: {b.prioridadeOrdem}</span>
									<span class="text-blue-900">👁 {b.totalVisualizacoes}</span>
								</div>
							</div>
							<div class="flex flex-col gap-1.5">
								<PrimaryButton
									label="Editar"
									variant="secondary"
									onclick={() => abrirEditar(b)}
								/>
								{#if auth.ehAdminOuDev}
									<button
										type="button"
										onclick={() => deletar(b)}
										class="border border-red-700 bg-white px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-red-700 uppercase hover:bg-red-50"
									>
										Excluir
									</button>
								{/if}
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
