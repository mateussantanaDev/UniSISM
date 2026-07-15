<script lang="ts">
	import FormField from '$lib/presentation/components/FormField.svelte';
	import PanelHeader from '$lib/presentation/components/PanelHeader.svelte';
	import PrimaryButton from '$lib/presentation/components/PrimaryButton.svelte';
	import Modal from '$lib/presentation/components/Modal.svelte';
	import { api, ApiError } from '$lib/api';
	import { mensagemErroTfd } from '$lib/api/erros-tfd';
	import type { Ubs } from '$lib/api/types';
	import type {
		DadosAcompanhante,
		DadosPacienteInline,
		PrioridadeTFD,
		TipoAnexoSolicitacaoTFD
	} from '$lib/api/tfd-types';
	import { useAuth } from '$lib/presentation/contexts/authContext';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	const auth = useAuth();

	// ─── Bloqueio de acesso ───
	let bloqueado = $derived(
		!auth.podeGerenciarTFD && !auth.ehReguladorTfdSimples
	);

	// ─── UBSs (para o vínculo) ───
	let ubsList = $state<Ubs[]>([]);
	let carregandoUbs = $state(true);

	// ─── Paciente ───
	let pacienteNome = $state('');
	let pacienteCpf = $state('');
	let pacienteRg = $state('');
	let pacienteDataNasc = $state('');
	let pacienteSexo = $state<'M' | 'F' | 'OUTRO'>('M');
	let pacienteTelefone = $state('');
	let pacienteCartaoSus = $state('');
	let pacienteNomeMae = $state('');
	let pacienteEndereco = $state('');
	let pacienteBairro = $state('');
	let pacienteMunicipio = $state('');
	let pacienteUf = $state('');
	let pacienteCep = $state('');

	// ─── Solicitação ───
	let ubsId = $state('');
	let especialidade = $state('');
	let destino = $state('');
	let unidadeDestino = $state('');
	let dataDesejada = $state('');
	let prioridade = $state<PrioridadeTFD>('ELETIVA');
	let motivo = $state('');
	let observacoes = $state('');

	// ─── Acompanhante ───
	let temAcompanhante = $state(false);
	let acompanhanteNome = $state('');
	let acompanhanteCpf = $state('');
	let acompanhanteRg = $state('');
	let acompanhanteDataNasc = $state('');
	let acompanhanteTelefone = $state('');
	let acompanhanteParentesco = $state('');

	// ─── Anexos ───
	interface AnexoItem {
		id: string;
		file: File;
		tipo: TipoAnexoSolicitacaoTFD;
		previewUrl: string;
		origem: 'upload' | 'camera' | 'scanner';
	}
	let anexos = $state<AnexoItem[]>([]);
	let tabAtiva = $state<'upload' | 'camera' | 'scanner'>('upload');
	let anexoVisualizar = $state<AnexoItem | null>(null);

	// Câmera / Webcam
	let videoEl = $state<HTMLVideoElement | null>(null);
	let stream = $state<MediaStream | null>(null);
	let cameraErro = $state('');
	let fotoCapturada = $state<string | null>(null);
	let fotoFile = $state<File | null>(null);
	let cameraDispositivos = $state<MediaDeviceInfo[]>([]);
	let cameraSelecionadaId = $state('');

	// Real Scanner States
	let scanSourceImage = $state<string | null>(null);
	let scanRotation = $state(0);
	let scanFilter = $state<'pb' | 'grayscale' | 'contrast' | 'original'>('pb');
	let scannerCanvasEl = $state<HTMLCanvasElement | null>(null);
	let scannerVideoEl = $state<HTMLVideoElement | null>(null);
	let scannerStream = $state<MediaStream | null>(null);
	let scannerCameraErro = $state('');
	let scanFile = $state<File | null>(null);
	let scanPreview = $state<string | null>(null);
	// CPF auto-fill states
	let ultimoCpfBuscado = $state('');
	let buscandoCpf = $state(false);
	let pacienteLocalizado = $state(false);

	// Estado de envio
	let enviando = $state(false);
	let enviandoAnexos = $state(false);
	let totalAnexosEnviar = $state(0);
	let atualAnexoEnviar = $state(0);
	let erro = $state('');
	let sucesso = $state<{ protocolo: string; id: string } | null>(null);

	const especialidadesComuns = [
		'CARDIOLOGIA',
		'OFTALMOLOGIA',
		'ORTOPEDIA',
		'NEUROLOGIA',
		'ONCOLOGIA',
		'GINECOLOGIA',
		'PEDIATRIA',
		'DERMATOLOGIA',
		'OTORRINOLARINGOLOGIA',
		'UROLOGIA',
		'ENDOCRINOLOGIA',
		'PSIQUIATRIA',
		'NEFROLOGIA',
		'PNEUMOLOGIA',
		'REUMATOLOGIA',
		'GASTROENTEROLOGIA',
		'HEMATOLOGIA',
		'CIRURGIA_GERAL',
		'CIRURGIA_VASCULAR'
	];
	const parentescos = [
		'CONJUGE',
		'FILHO_A',
		'PAI',
		'MAE',
		'IRMAO_A',
		'AVO',
		'NETO_A',
		'TIO_A',
		'SOBRINHO_A',
		'CUIDADOR',
		'OUTRO'
	];

	onMount(async () => {
		try {
			ubsList = await api.admin.listUbs();
			if (ubsList.length === 1) ubsId = ubsList[0].id;
		} catch {
			// Silencia — campo aparece vazio se não tem permissão de listar.
		} finally {
			carregandoUbs = false;
		}

		try {
			// Auto-fill Municipio and UF based on the regulator's prefeitura
			const me = auth.me;
			if (me && me.prefeitura) {
				const prefeituras = await api.admin.listPrefeituras();
				const minhaPrefeitura = prefeituras.find(
					(p) => p.id === me.prefeitura || p.nome === me.prefeitura
				);
				if (minhaPrefeitura) {
					pacienteMunicipio = minhaPrefeitura.municipio;
					pacienteUf = minhaPrefeitura.uf;
				} else if (prefeituras.length === 1) {
					pacienteMunicipio = prefeituras[0].municipio;
					pacienteUf = prefeituras[0].uf;
				}
			}
		} catch (e) {
			console.error('Erro ao obter prefeitura do regulador:', e);
		}
	});

	// Webcam controllers
	async function iniciarCamera() {
		fecharCamera();
		cameraErro = '';
		fotoCapturada = null;
		fotoFile = null;
		try {
			// Solicita acesso inicial
			await navigator.mediaDevices.getUserMedia({ video: true });
			
			// Lista dispositivos
			const devices = await navigator.mediaDevices.enumerateDevices();
			cameraDispositivos = devices.filter((d) => d.kind === 'videoinput');
			if (cameraDispositivos.length === 0) {
				cameraErro = 'Nenhuma câmera de vídeo detectada.';
				return;
			}

			const constraints: MediaStreamConstraints = {
				video: cameraSelecionadaId
					? { deviceId: { exact: cameraSelecionadaId } }
					: { facingMode: 'environment' }
			};

			stream = await navigator.mediaDevices.getUserMedia(constraints);
			if (videoEl) {
				videoEl.srcObject = stream;
				try {
					await videoEl.play();
				} catch (playErr) {
					console.warn('Falha no autoplay da câmera:', playErr);
				}
			}
		} catch (e) {
			console.error(e);
			cameraErro = 'Acesso à webcam negado ou não suportado por este dispositivo.';
		}
	}

	function fecharCamera() {
		if (stream) {
			stream.getTracks().forEach((track) => track.stop());
			stream = null;
		}
		if (videoEl) {
			videoEl.srcObject = null;
		}
	}

	function tirarFoto() {
		if (!videoEl) return;
		const canvas = document.createElement('canvas');
		canvas.width = videoEl.videoWidth || 640;
		canvas.height = videoEl.videoHeight || 480;
		const ctx = canvas.getContext('2d');
		if (ctx) {
			// Espelha para ficar intuitivo
			ctx.translate(canvas.width, 0);
			ctx.scale(-1, 1);
			ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
			// Reseta transformações
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			fotoCapturada = canvas.toDataURL('image/jpeg');
			canvas.toBlob((blob) => {
				if (blob) {
					fotoFile = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' });
				}
			}, 'image/jpeg', 0.9);
		}
		fecharCamera();
	}

	function descartarFoto() {
		fotoCapturada = null;
		fotoFile = null;
		iniciarCamera();
	}

	function confirmarFoto() {
		if (fotoFile && fotoCapturada) {
			const novoAnexo: AnexoItem = {
				id: Math.random().toString(36).substring(2, 9),
				file: fotoFile,
				tipo: 'EXAME',
				previewUrl: fotoCapturada,
				origem: 'camera'
			};
			anexos = [...anexos, novoAnexo];
			fotoCapturada = null;
			fotoFile = null;
		}
	}

	// Real document scanner controllers
	async function iniciarCameraScanner() {
		fecharCameraScanner();
		scannerCameraErro = '';
		try {
			await navigator.mediaDevices.getUserMedia({ video: true });
			const devices = await navigator.mediaDevices.enumerateDevices();
			cameraDispositivos = devices.filter((d) => d.kind === 'videoinput');

			const constraints: MediaStreamConstraints = {
				video: cameraSelecionadaId
					? { deviceId: { exact: cameraSelecionadaId } }
					: { facingMode: 'environment' }
			};

			scannerStream = await navigator.mediaDevices.getUserMedia(constraints);
			if (scannerVideoEl) {
				scannerVideoEl.srcObject = scannerStream;
				try {
					await scannerVideoEl.play();
				} catch (playErr) {
					console.warn('Falha no autoplay do scanner:', playErr);
				}
			}
		} catch (e) {
			console.error(e);
			scannerCameraErro = 'Erro ao inicializar câmera para escaneamento.';
		}
	}

	function fecharCameraScanner() {
		if (scannerStream) {
			scannerStream.getTracks().forEach((track) => track.stop());
			scannerStream = null;
		}
		if (scannerVideoEl) {
			scannerVideoEl.srcObject = null;
		}
	}

	function capturarFotoScanner() {
		if (!scannerVideoEl) return;
		const canvas = document.createElement('canvas');
		canvas.width = scannerVideoEl.videoWidth || 1280;
		canvas.height = scannerVideoEl.videoHeight || 720;
		const ctx = canvas.getContext('2d');
		if (ctx) {
			ctx.translate(canvas.width, 0);
			ctx.scale(-1, 1);
			ctx.drawImage(scannerVideoEl, 0, 0, canvas.width, canvas.height);
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			scanSourceImage = canvas.toDataURL('image/jpeg');
			scanRotation = 0;
			scanFilter = 'pb';
		}
		fecharCameraScanner();
	}

	function handleLocalImageScanner(e: Event) {
		const target = e.target as HTMLInputElement;
		const file = target.files?.[0];
		if (file) {
			const reader = new FileReader();
			reader.onload = (ev) => {
				scanSourceImage = ev.target?.result as string || '';
				scanRotation = 0;
				scanFilter = 'pb';
			};
			reader.readAsDataURL(file);
		}
		target.value = '';
	}

	function processarImagemScanner() {
		if (!scanSourceImage || !scannerCanvasEl) return;
		const img = new Image();
		img.onload = () => {
			const canvas = scannerCanvasEl!;
			const ctx = canvas.getContext('2d');
			if (!ctx) return;

			const isRotated90 = scanRotation === 90 || scanRotation === 270;
			const width = isRotated90 ? img.height : img.width;
			const height = isRotated90 ? img.width : img.height;

			canvas.width = width;
			canvas.height = height;

			ctx.clearRect(0, 0, width, height);
			ctx.translate(width / 2, height / 2);
			ctx.rotate((scanRotation * Math.PI) / 180);
			ctx.drawImage(img, -img.width / 2, -img.height / 2);
			ctx.setTransform(1, 0, 0, 1, 0, 0);

			if (scanFilter !== 'original') {
				const imgData = ctx.getImageData(0, 0, width, height);
				const data = imgData.data;

				for (let i = 0; i < data.length; i += 4) {
					const r = data[i];
					const g = data[i + 1];
					const b = data[i + 2];
					const gray = 0.299 * r + 0.587 * g + 0.114 * b;

					if (scanFilter === 'pb') {
						const threshold = 125;
						const val = gray > threshold ? 255 : 0;
						data[i] = val;
						data[i + 1] = val;
						data[i + 2] = val;
					} else if (scanFilter === 'grayscale') {
						data[i] = gray;
						data[i + 1] = gray;
						data[i + 2] = gray;
					} else if (scanFilter === 'contrast') {
						let val = gray;
						if (val < 100) val = Math.max(0, val - 40);
						else if (val > 150) val = Math.min(255, val + 40);
						data[i] = val;
						data[i + 1] = val;
						data[i + 2] = val;
					}
				}
				ctx.putImageData(imgData, 0, 0);
			}

			scanPreview = canvas.toDataURL('image/jpeg');
			canvas.toBlob((blob) => {
				if (blob) {
					scanFile = new File([blob], `escaneado_${Date.now()}.jpg`, { type: 'image/jpeg' });
				}
			}, 'image/jpeg', 0.85);
		};
		img.src = scanSourceImage;
	}

	function confirmarScanner() {
		if (scanFile && scanPreview) {
			const novoAnexo: AnexoItem = {
				id: Math.random().toString(36).substring(2, 9),
				file: scanFile,
				tipo: 'COMPROVANTE_ENCAMINHAMENTO',
				previewUrl: scanPreview,
				origem: 'scanner'
			};
			anexos = [...anexos, novoAnexo];
			scanSourceImage = null;
			scanFile = null;
			scanPreview = null;
		}
	}

	function descartarScanner() {
		scanSourceImage = null;
		scanFile = null;
		scanPreview = null;
	}

	function rotacionarScanner() {
		scanRotation = (scanRotation + 90) % 360;
	}

	// Upload Files
	function handleFilesUploaded(e: Event) {
		const target = e.target as HTMLInputElement;
		const filesList = Array.from(target.files ?? []);
		for (const file of filesList) {
			const reader = new FileReader();
			reader.onload = (ev) => {
				const previewUrl = ev.target?.result as string || '';
				const novoAnexo: AnexoItem = {
					id: Math.random().toString(36).substring(2, 9),
					file,
					tipo: 'COMPROVANTE_ENCAMINHAMENTO',
					previewUrl: file.type.startsWith('image/') ? previewUrl : '',
					origem: 'upload'
				};
				anexos = [...anexos, novoAnexo];
			};
			reader.readAsDataURL(file);
		}
		target.value = '';
	}

	function removerAnexo(localId: string) {
		anexos = anexos.filter((a) => a.id !== localId);
	}

	// Dynamic triggers for webcam cleanup and initialization
	$effect(() => {
		if (tabAtiva === 'camera' && videoEl) {
			iniciarCamera();
		} else if (tabAtiva !== 'camera') {
			fecharCamera();
		}
		return () => {
			fecharCamera();
		};
	});

	// Scanner camera cleanup and trigger
	$effect(() => {
		if (tabAtiva === 'scanner' && !scanSourceImage && scannerVideoEl) {
			iniciarCameraScanner();
		} else {
			fecharCameraScanner();
		}
		return () => {
			fecharCameraScanner();
		};
	});

	// Pixel processing trigger
	$effect(() => {
		if (scanSourceImage && scannerCanvasEl) {
			processarImagemScanner();
		}
	});

	function validar(): string | null {
		if (!pacienteNome.trim()) return 'Nome do paciente é obrigatório.';
		if (pacienteCpf.replace(/\D/g, '').length !== 11)
			return 'CPF do paciente inválido (precisa de 11 dígitos).';
		if (!pacienteDataNasc) return 'Data de nascimento do paciente é obrigatória.';
		if (!pacienteTelefone.trim()) return 'Telefone do paciente é obrigatório.';
		if (!pacienteEndereco.trim()) return 'Endereço do paciente é obrigatório.';
		if (!ubsId) return 'Selecione a UBS de origem.';
		if (!especialidade.trim()) return 'Selecione a especialidade da consulta.';
		if (!destino.trim()) return 'Informe o município de destino.';
		if (!dataDesejada) return 'Informe a data desejada para a viagem.';
		if (!motivo.trim() || motivo.trim().length < 10)
			return 'Descreva o motivo da viagem (mínimo 10 caracteres).';
		if (temAcompanhante) {
			if (!acompanhanteNome.trim()) return 'Nome do acompanhante é obrigatório.';
			if (acompanhanteCpf.replace(/\D/g, '').length !== 11)
				return 'CPF do acompanhante inválido.';
			if (!acompanhanteDataNasc) return 'Data de nascimento do acompanhante é obrigatória.';
			if (!acompanhanteTelefone.trim()) return 'Telefone do acompanhante é obrigatório.';
			if (!acompanhanteParentesco) return 'Selecione o parentesco do acompanhante.';
		}
		return null;
	}

	async function enviar() {
		erro = '';
		const v = validar();
		if (v) {
			erro = v;
			return;
		}
		enviando = true;
		enviandoAnexos = false;
		try {
			const paciente: DadosPacienteInline = {
				nome: pacienteNome.trim(),
				cpf: pacienteCpf.replace(/\D/g, ''),
				dataNascimento: pacienteDataNasc,
				sexo: pacienteSexo,
				telefone: pacienteTelefone.trim(),
				endereco: pacienteEndereco.trim(),
				cartaoSus: pacienteCartaoSus.trim() || undefined,
				nomeMae: pacienteNomeMae.trim() || undefined,
				rg: pacienteRg.trim() || undefined,
				bairro: pacienteBairro.trim() || undefined,
				municipio: pacienteMunicipio.trim() || undefined,
				uf: pacienteUf.trim() || undefined,
				cep: pacienteCep.trim() || undefined
			};
			const acompanhante: DadosAcompanhante | undefined = temAcompanhante
				? {
						nome: acompanhanteNome.trim(),
						cpf: acompanhanteCpf.replace(/\D/g, ''),
						dataNascimento: acompanhanteDataNasc,
						telefone: acompanhanteTelefone.trim(),
						parentesco: acompanhanteParentesco,
						rg: acompanhanteRg.trim() || undefined
					}
				: undefined;

			// 1. Cria a solicitação
			const r = await api.tfd.solicitacoes.create({
				paciente,
				ubsId,
				destino: destino.trim(),
				unidadeDestino: unidadeDestino.trim() || undefined,
				especialidade,
				motivo: motivo.trim(),
				dataDesejada,
				prioridade,
				acompanhanteNecessario: temAcompanhante,
				acompanhante,
				observacoes: observacoes.trim() || undefined
			});

			// 2. Envia anexos se houver
			if (anexos.length > 0) {
				enviandoAnexos = true;
				totalAnexosEnviar = anexos.length;
				for (let i = 0; i < anexos.length; i++) {
					atualAnexoEnviar = i + 1;
					const an = anexos[i];
					try {
						await api.tfd.solicitacoes.anexar(r.id, an.file, an.tipo);
					} catch (uploadError) {
						console.error(`Erro ao anexar arquivo ${an.file.name}:`, uploadError);
					}
				}
			}

			// Reseta anexos
			anexos = [];

			sucesso = { protocolo: r.protocolo, id: r.id };
		} catch (e) {
			if (e instanceof ApiError) {
				erro = mensagemErroTfd(e);
			} else {
				erro = 'Falha de conexão com o servidor.';
			}
		} finally {
			enviando = false;
			enviandoAnexos = false;
		}
	}

	function novaOutra() {
		pacienteNome = '';
		pacienteCpf = '';
		pacienteRg = '';
		pacienteDataNasc = '';
		pacienteSexo = 'M';
		pacienteTelefone = '';
		pacienteCartaoSus = '';
		pacienteNomeMae = '';
		pacienteEndereco = '';
		pacienteBairro = '';
		pacienteMunicipio = '';
		pacienteUf = '';
		pacienteCep = '';
		especialidade = '';
		destino = '';
		unidadeDestino = '';
		dataDesejada = '';
		prioridade = 'ELETIVA';
		motivo = '';
		observacoes = '';
		temAcompanhante = false;
		acompanhanteNome = '';
		acompanhanteCpf = '';
		acompanhanteRg = '';
		acompanhanteDataNasc = '';
		acompanhanteTelefone = '';
		acompanhanteParentesco = '';
		anexos = [];
		tabAtiva = 'upload';
		ultimoCpfBuscado = '';
		pacienteLocalizado = false;
		buscandoCpf = false;
		erro = '';
		sucesso = null;
	}

	async function buscarPacientePorCpf(cpf: string) {
		pacienteLocalizado = false;
		buscandoCpf = true;
		try {
			const res = await api.pacientes.porCpf(cpf);
			if (res && res.existe && res.paciente) {
				const p = res.paciente;
				pacienteNome = p.nome || '';
				if (p.dataNascimento) {
					pacienteDataNasc = p.dataNascimento.substring(0, 10);
				}
				pacienteSexo = p.sexo || 'M';
				pacienteTelefone = p.telefone || '';
				pacienteCartaoSus = p.cartaoSus || '';
				pacienteNomeMae = p.nomeMae || '';
				pacienteEndereco = p.endereco || '';
				pacienteBairro = p.bairro || '';
				if (p.municipio) pacienteMunicipio = p.municipio;
				if (p.uf) pacienteUf = p.uf;
				pacienteCep = p.cep || '';
				pacienteLocalizado = true;
			}
		} catch (err) {
			console.log('Erro ao buscar paciente por CPF:', err);
		} finally {
			buscandoCpf = false;
		}
	}

	$effect(() => {
		const clean = pacienteCpf.replace(/\D/g, '');
		if (clean.length === 11) {
			if (clean !== ultimoCpfBuscado) {
				ultimoCpfBuscado = clean;
				buscarPacientePorCpf(clean);
			}
		} else {
			pacienteLocalizado = false;
			ultimoCpfBuscado = '';
		}
	});

	function onSubmit(e: SubmitEvent) {
		e.preventDefault();
		enviar();
	}
</script>

{#if bloqueado}
	<div class="border-2 border-red-700 bg-red-50 p-6 text-center">
		<div class="font-mono text-sm font-bold tracking-widest text-red-900 uppercase">
			Permissão insuficiente
		</div>
		<p class="mt-2 text-xs text-red-800">
			Sua função não pode cadastrar solicitações TFD.
		</p>
	</div>
{:else if sucesso}
	<div class="border-2 border-emerald-700 bg-emerald-50 p-6">
		<div class="font-mono text-[11px] font-bold tracking-widest text-emerald-800 uppercase">
			✓ SOLICITAÇÃO CADASTRADA
		</div>
		<div class="mt-2 font-mono text-2xl font-bold text-emerald-900">
			{sucesso.protocolo}
		</div>
		<p class="mt-2 font-sans text-xs text-emerald-900">
			A gestão TFD será notificada e fará a aprovação. Você pode acompanhar pelo
			<strong>Dashboard</strong>.
		</p>
		<div class="mt-4 flex flex-wrap gap-2">
			<PrimaryButton label="Cadastrar Outra" onclick={novaOutra} />
			<PrimaryButton
				label="Voltar ao Dashboard"
				variant="secondary"
				onclick={() => goto('/tfd/dashboard')}
			/>
			{#if auth.podeGerenciarTFD}
				<PrimaryButton
					label="Abrir Detalhe"
					variant="secondary"
					onclick={() => goto(`/tfd/solicitacoes/${sucesso!.id}`)}
				/>
			{/if}
		</div>
	</div>
{:else}
	<form onsubmit={onSubmit} class="flex flex-col gap-4">
		<!-- Paciente -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Identificação do Paciente"
				subtitle="Quem vai viajar — todos os dados ficam salvos no PEC municipal"
				index="01"
			/>
			<div class="p-4">
				<div class="grid grid-cols-12 gap-3">
					<FormField label="Nome Completo" name="pnome" span={8} bind:value={pacienteNome} />
					<FormField
						label="Data de Nascimento"
						name="pdn"
						type="date"
						span={4}
						mono
						bind:value={pacienteDataNasc}
					/>
					<FormField
						label="CPF"
						name="pcpf"
						span={4}
						mono
						bind:value={pacienteCpf}
						loading={buscandoCpf}
						hint={pacienteLocalizado ? '✓ Localizado' : ''}
					/>
					<FormField label="RG (opcional)" name="prg" span={4} mono bind:value={pacienteRg} />
					<div class="col-span-4 flex flex-col">
						<label
							for="psexo"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Sexo
						</label>
						<select
							id="psexo"
							bind:value={pacienteSexo}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						>
							<option value="M">Masculino</option>
							<option value="F">Feminino</option>
							<option value="OUTRO">Outro</option>
						</select>
					</div>
					<FormField label="Telefone" name="ptel" span={4} mono bind:value={pacienteTelefone} />
					<FormField
						label="Cartão SUS (opcional)"
						name="pcs"
						span={4}
						mono
						bind:value={pacienteCartaoSus}
					/>
					<FormField
						label="Nome da Mãe (opcional)"
						name="pnm"
						span={4}
						bind:value={pacienteNomeMae}
					/>
					<FormField
						label="Endereço completo"
						name="pend"
						span={12}
						placeholder="Logradouro, número, complemento"
						bind:value={pacienteEndereco}
					/>
					<FormField label="Bairro" name="pbairro" span={4} bind:value={pacienteBairro} />
					<FormField label="Município" name="pmun" span={4} bind:value={pacienteMunicipio} />
					<FormField label="UF" name="puf" span={2} mono bind:value={pacienteUf} />
					<FormField label="CEP (opcional)" name="pcep" span={2} mono bind:value={pacienteCep} />
				</div>
			</div>
		</div>

		<!-- Solicitação clínica -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Detalhes da Viagem"
				subtitle="Especialidade · destino · prioridade · motivo"
				index="02"
			/>
			<div class="p-4">
				<div class="grid grid-cols-12 gap-3">
					<div class="col-span-6 flex flex-col">
						<label
							for="ubs"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							UBS de Origem
						</label>
						<select
							id="ubs"
							bind:value={ubsId}
							disabled={carregandoUbs}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900 disabled:cursor-not-allowed disabled:bg-slate-50"
						>
							<option value="">— Selecione a UBS —</option>
							{#each ubsList as u (u.id)}
								<option value={u.id}>{u.nome} · {u.municipio}/{u.uf}</option>
							{/each}
						</select>
					</div>
					<div class="col-span-6 flex flex-col">
						<label
							for="esp"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Especialidade
						</label>
						<input
							list="lista-esp"
							id="esp"
							bind:value={especialidade}
							placeholder="Ex.: CARDIOLOGIA"
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						/>
						<datalist id="lista-esp">
							{#each especialidadesComuns as e (e)}
								<option value={e}></option>
							{/each}
						</datalist>
					</div>

					<FormField
						label="Município de Destino"
						name="destino"
						span={6}
						placeholder="Ex.: Recife/PE"
						bind:value={destino}
					/>
					<FormField
						label="Unidade de Destino (opcional)"
						name="udest"
						span={6}
						placeholder="Ex.: Hospital das Clínicas"
						bind:value={unidadeDestino}
					/>

					<FormField
						label="Data desejada"
						name="ddes"
						type="date"
						span={4}
						mono
						bind:value={dataDesejada}
					/>
					<div class="col-span-4 flex flex-col">
						<label
							for="prio"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Prioridade
						</label>
						<select
							id="prio"
							bind:value={prioridade}
							class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						>
							<option value="ELETIVA">Eletiva</option>
							<option value="PRIORITARIA">Prioritária</option>
							<option value="URGENTE">Urgente</option>
						</select>
					</div>
					<div class="col-span-4 flex items-end">
						<label class="flex cursor-pointer items-center gap-2 font-mono text-xs text-slate-700">
							<input
								type="checkbox"
								bind:checked={temAcompanhante}
								class="h-4 w-4 cursor-pointer border-slate-400"
							/>
							<span class="font-semibold tracking-widest uppercase">Tem Acompanhante</span>
						</label>
					</div>

					<div class="col-span-12 flex flex-col">
						<label
							for="motivo"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Motivo / Procedimento (mínimo 10 caracteres)
						</label>
						<textarea
							id="motivo"
							bind:value={motivo}
							rows="3"
							placeholder="Ex.: Consulta de retorno com cardiologista para ajuste de medicação. Encaminhamento da UBS."
							class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						></textarea>
					</div>

					<div class="col-span-12 flex flex-col">
						<label
							for="obs"
							class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
						>
							Observações (opcional)
						</label>
						<textarea
							id="obs"
							bind:value={observacoes}
							rows="2"
							placeholder="Ex.: paciente cadeirante; alergia conhecida a látex."
							class="w-full resize-none border border-slate-300 bg-white px-2.5 py-1.5 font-sans text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
						></textarea>
					</div>
				</div>
			</div>
		</div>

		<!-- Acompanhante -->
		{#if temAcompanhante}
			<div class="border border-slate-200 bg-white">
				<PanelHeader
					title="Dados do Acompanhante"
					subtitle="Quem viajará com o paciente"
					index="03"
				/>
				<div class="p-4">
					<div class="grid grid-cols-12 gap-3">
						<FormField
							label="Nome Completo"
							name="anome"
							span={8}
							bind:value={acompanhanteNome}
						/>
						<FormField
							label="Data de Nascimento"
							name="adn"
							type="date"
							span={4}
							mono
							bind:value={acompanhanteDataNasc}
						/>
						<FormField label="CPF" name="acpf" span={4} mono bind:value={acompanhanteCpf} />
						<FormField
							label="RG (opcional)"
							name="arg"
							span={4}
							mono
							bind:value={acompanhanteRg}
						/>
						<FormField
							label="Telefone"
							name="atel"
							span={4}
							mono
							bind:value={acompanhanteTelefone}
						/>
						<div class="col-span-12 flex flex-col">
							<label
								for="aparent"
								class="mb-1 text-[10px] font-semibold tracking-widest text-slate-600 uppercase"
							>
								Parentesco com o Paciente
							</label>
							<select
								id="aparent"
								bind:value={acompanhanteParentesco}
								class="w-full border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 outline-none focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
							>
								<option value="">— Selecione —</option>
								{#each parentescos as p (p)}
									<option value={p}>{p.replace('_', ' ')}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
			</div>
		{/if}

		<!-- Documentos Anexos -->
		<div class="border border-slate-200 bg-white">
			<PanelHeader
				title="Documentos Anexos"
				subtitle="Anexe comprovantes de encaminhamento, laudos ou exames para a auditoria TFD"
				index="04"
			/>
			<div class="p-4 flex flex-col gap-4">
				<!-- Tab Selector -->
				<div class="flex border-b border-slate-200 font-mono text-xs">
					<button
						type="button"
						onclick={() => tabAtiva = 'upload'}
						class="px-4 py-2 border-b-2 font-semibold tracking-wider transition-colors
							{tabAtiva === 'upload'
							? 'border-blue-900 text-blue-900 bg-slate-50'
							: 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'}"
					>
						📁 ARQUIVO LOCAL
					</button>
					<button
						type="button"
						onclick={() => tabAtiva = 'camera'}
						class="px-4 py-2 border-b-2 font-semibold tracking-wider transition-colors
							{tabAtiva === 'camera'
							? 'border-blue-900 text-blue-900 bg-slate-50'
							: 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'}"
					>
						📷 WEBCAM / CÂMERA
					</button>
					<button
						type="button"
						onclick={() => tabAtiva = 'scanner'}
						class="px-4 py-2 border-b-2 font-semibold tracking-wider transition-colors
							{tabAtiva === 'scanner'
							? 'border-blue-900 text-blue-900 bg-slate-50'
							: 'border-transparent text-slate-500 hover:text-slate-900 hover:bg-slate-50'}"
					>
						🖨️ SCANNER (MOCK)
					</button>
				</div>

				<!-- Tab Content -->
				<div class="bg-slate-50 p-4 border border-slate-200">
					{#if tabAtiva === 'upload'}
						<div class="flex flex-col items-center justify-center py-6 text-center border-2 border-dashed border-slate-300 bg-white hover:border-blue-900 transition-colors">
							<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-slate-400 mb-2">
								<path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
							</svg>
							<span class="font-mono text-xs font-bold text-slate-700 tracking-wider">SELECIONAR DOCUMENTO</span>
							<span class="text-[10px] text-slate-500 mt-1">PDF, JPG, PNG ou WebP até 10MB</span>
							<input
								type="file"
								multiple
								accept="application/pdf,image/jpeg,image/png,image/webp"
								onchange={handleFilesUploaded}
								class="hidden"
								id="upload-file-input"
							/>
							<label
								for="upload-file-input"
								class="mt-3 cursor-pointer border border-blue-900 bg-blue-50 px-3 py-1 font-mono text-[10px] font-bold tracking-widest text-blue-900 uppercase hover:bg-blue-100 transition-colors"
							>
								PROCURAR ARQUIVOS
							</label>
						</div>
					{:else if tabAtiva === 'camera'}
						<div class="flex flex-col items-center gap-4 bg-white border border-slate-200 p-6">
							{#if cameraErro}
								<div class="text-center py-8">
									<div class="inline-flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-700 font-bold text-lg mb-3">⚠</div>
									<p class="font-mono text-xs font-bold text-red-700 uppercase tracking-wider">{cameraErro}</p>
									<p class="text-[11px] text-slate-500 mt-1 max-w-sm">Verifique se a webcam está conectada e se você concedeu as permissões necessárias no navegador.</p>
									<button
										type="button"
										onclick={iniciarCamera}
										class="mt-4 border border-blue-900 bg-blue-50 px-4 py-1.5 font-mono text-[10px] font-bold text-blue-900 hover:bg-blue-100 uppercase tracking-widest transition-colors"
									>
										Tentar Reconectar Câmera
									</button>
								</div>
							{:else if fotoCapturada}
								<div class="relative w-full aspect-video md:max-w-4xl max-w-2xl bg-slate-900 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center shadow-lg">
									<img src={fotoCapturada} alt="Preview da Câmera" class="w-full h-full object-cover" />
									
									<!-- Premium action overlay -->
									<div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-6 flex gap-3 justify-center">
										<button
											type="button"
											onclick={descartarFoto}
											class="px-5 py-2 border border-slate-500 bg-slate-800/80 backdrop-blur text-white hover:bg-slate-700 rounded font-mono text-[10px] font-bold tracking-wider uppercase transition-all"
										>
											✕ DESCARTAR
										</button>
										<button
											type="button"
											onclick={confirmarFoto}
											class="px-5 py-2 border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500 rounded font-mono text-[10px] font-bold tracking-wider uppercase transition-all shadow-lg shadow-emerald-950/20"
										>
											✓ CONFIRMAR E ADICIONAR
										</button>
									</div>
								</div>
							{:else}
								<div class="relative w-full aspect-video md:max-w-4xl max-w-2xl bg-slate-950 border border-slate-800 rounded-lg overflow-hidden flex items-center justify-center shadow-inner">
									<!-- svelte-ignore a11y_media_has_caption -->
									<video
										bind:this={videoEl}
										autoplay
										playsinline
										muted
										class="w-full h-full object-cover scale-x-[-1]"
									></video>

									<!-- Document framing overlay -->
									<div class="absolute inset-0 border-[36px] border-black/45 pointer-events-none flex items-center justify-center">
										<div class="w-[90%] h-[90%] border-2 border-dashed border-white/45 rounded flex items-center justify-center">
											<div class="font-mono text-[9px] text-white/90 bg-black/60 px-4 py-2 rounded tracking-widest uppercase pointer-events-auto shadow backdrop-blur-sm">
												Centralize o documento nesta área
											</div>
										</div>
									</div>

									<!-- Camera selector overlay -->
									{#if cameraDispositivos.length > 1}
										<div class="absolute top-4 right-4 bg-slate-900/85 backdrop-blur border border-slate-700 px-3 py-1.5 rounded shadow flex items-center gap-2 text-[9px] font-mono text-white">
											<span>CÂMERA ATIVA:</span>
											<select
												bind:value={cameraSelecionadaId}
												onchange={iniciarCamera}
												class="bg-slate-800 text-white border border-slate-700 px-2 py-0.5 rounded outline-none cursor-pointer"
											>
												{#each cameraDispositivos as dev}
													<option value={dev.deviceId}>{dev.label || `Câmera ${dev.deviceId.slice(0, 4)}`}</option>
												{/each}
											</select>
										</div>
									{/if}

									<!-- Circular shutter button overlay -->
									<div class="absolute bottom-6 flex justify-center w-full">
										<button
											type="button"
											onclick={tirarFoto}
											class="h-16 w-16 rounded-full border-4 border-white bg-red-600 shadow-2xl active:scale-95 transition-transform flex items-center justify-center group"
											title="Capturar Foto"
										>
											<span class="h-6 w-6 rounded-full bg-white opacity-0 group-hover:opacity-30 transition-opacity"></span>
										</button>
									</div>
								</div>
								<div class="text-[10px] text-slate-500 font-mono text-center max-w-md">
									Certifique-se de que a iluminação esteja adequada e o documento esteja completamente legível antes de capturar.
								</div>
							{/if}
						</div>
					{:else if tabAtiva === 'scanner'}
						<div class="flex flex-col items-center bg-white border border-slate-200 p-6">
							{#if scanSourceImage}
								<!-- Scanner Image Editor Workspace -->
								<div class="w-full flex flex-col items-center gap-4">
									<div class="text-[10px] font-bold tracking-widest text-blue-900 uppercase">
										🖨️ PROCESSADOR DE ESCANEAMENTO DE DOCUMENTO
									</div>

									<!-- Hidden canvas for pixel filter operations -->
									<canvas bind:this={scannerCanvasEl} class="hidden"></canvas>

									<!-- Processed Image Preview Frame -->
									<div class="relative w-full max-h-[60vh] md:max-w-2xl bg-slate-100 border border-slate-300 rounded shadow-md overflow-hidden flex items-center justify-center">
										{#if scanPreview}
											<img src={scanPreview} alt="Guia Escaneada" class="max-w-full max-h-[50vh] object-contain" />
										{/if}
									</div>

									<!-- Scanner Controls & Filters Toolbar -->
									<div class="w-full md:max-w-2xl flex flex-col gap-3 font-mono text-xs">
										<!-- Filters selector -->
										<div class="flex flex-wrap items-center justify-between border-t border-slate-200 pt-3 gap-2">
											<div class="flex items-center gap-1.5">
												<span class="font-bold text-slate-700">FILTROS:</span>
												<button
													type="button"
													onclick={() => scanFilter = 'pb'}
													class="px-2 py-1 border rounded text-[10px] font-bold transition-all
														{scanFilter === 'pb' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}"
												>
													DOCUMENTO P&B
												</button>
												<button
													type="button"
													onclick={() => scanFilter = 'contrast'}
													class="px-2 py-1 border rounded text-[10px] font-bold transition-all
														{scanFilter === 'contrast' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}"
												>
													ALTO CONTRASTE
												</button>
												<button
													type="button"
													onclick={() => scanFilter = 'grayscale'}
													class="px-2 py-1 border rounded text-[10px] font-bold transition-all
														{scanFilter === 'grayscale' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}"
												>
													TONS DE CINZA
												</button>
												<button
													type="button"
													onclick={() => scanFilter = 'original'}
													class="px-2 py-1 border rounded text-[10px] font-bold transition-all
														{scanFilter === 'original' ? 'bg-blue-900 text-white border-blue-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}"
												>
													FOTO ORIGINAL
												</button>
											</div>

											<button
												type="button"
												onclick={rotacionarScanner}
												class="px-3 py-1 border border-slate-300 bg-white hover:bg-slate-100 rounded text-[10px] font-bold flex items-center gap-1 text-slate-700"
											>
												🔄 ROTACIONAR 90°
											</button>
										</div>

										<!-- Actions Confirmation -->
										<div class="flex gap-2 border-t border-slate-200 pt-3">
											<button
												type="button"
												onclick={descartarScanner}
												class="flex-1 border border-slate-300 bg-white py-2 text-[10px] font-bold text-slate-700 uppercase hover:bg-slate-50 transition-colors"
											>
												✕ DESCARTAR
											</button>
											<button
												type="button"
												onclick={confirmarScanner}
												class="flex-1 border border-emerald-600 bg-emerald-600 py-2 text-[10px] font-bold text-white uppercase hover:bg-emerald-500 transition-colors shadow"
											>
												✓ SALVAR DOCUMENTO ESCANEADO
											</button>
										</div>
									</div>
								</div>
							{:else}
								<!-- Scanner Source Selector -->
								<div class="w-full flex flex-col items-center gap-4">
									<div class="text-[10px] font-bold tracking-widest text-slate-600 uppercase mb-2">
										SELECIONE A ORIGEM DO DOCUMENTO PARA ESCANEAMENTO
									</div>

									<div class="grid grid-cols-1 md:grid-cols-2 gap-4 w-full md:max-w-2xl">
										<!-- Option A: File upload for scanning -->
										<div class="border border-slate-200 bg-slate-50 p-4 rounded flex flex-col items-center text-center justify-between min-h-[220px]">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-slate-400">
												<path stroke-linecap="round" stroke-linejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
											</svg>
											<div>
												<span class="font-bold text-slate-700 text-xs block uppercase">IMPORTAR IMAGEM LOCAL</span>
												<span class="text-[10px] text-slate-500 mt-1 block">Escolha uma foto salva no computador para aplicar os filtros de scanner</span>
											</div>
											<input
												type="file"
												accept="image/jpeg,image/png,image/webp"
												onchange={handleLocalImageScanner}
												class="hidden"
												id="scanner-file-input"
											/>
											<label
												for="scanner-file-input"
												class="cursor-pointer border border-blue-900 bg-blue-50 px-4 py-1.5 font-mono text-[9px] font-bold text-blue-900 uppercase hover:bg-blue-100 transition-colors"
											>
												PROCURAR FOTO
											</label>
										</div>

										<!-- Option B: Webcam for scanning -->
										<div class="border border-slate-200 bg-slate-50 p-4 rounded flex flex-col items-center text-center justify-between min-h-[220px]">
											<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-10 h-10 text-slate-400">
												<path stroke-linecap="round" stroke-linejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
												<path stroke-linecap="round" stroke-linejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
											</svg>
											<div>
												<span class="font-bold text-slate-700 text-xs block uppercase">CAPTURAR DA WEBCAM</span>
												<span class="text-[10px] text-slate-500 mt-1 block">Tire uma foto do documento agora usando a câmera do computador</span>
											</div>
											<button
												type="button"
												onclick={iniciarCameraScanner}
												class="border border-blue-900 bg-blue-50 px-4 py-1.5 font-mono text-[9px] font-bold text-blue-900 uppercase hover:bg-blue-100 transition-colors"
											>
												ABRIR WEBCAM
											</button>
										</div>
									</div>

									<!-- Scanner Live Webcam Feed viewport -->
									{#if scannerStream || scannerCameraErro}
										<div class="w-full md:max-w-2xl border border-slate-200 rounded p-4 mt-2 bg-slate-50">
											{#if scannerCameraErro}
												<p class="font-mono text-xs text-red-700 text-center font-bold">⚠ {scannerCameraErro}</p>
											{:else}
												<div class="relative w-full aspect-video bg-black overflow-hidden rounded flex items-center justify-center">
													<!-- svelte-ignore a11y_media_has_caption -->
													<video
														bind:this={scannerVideoEl}
														autoplay
														playsinline
														muted
														class="w-full h-full object-cover scale-x-[-1]"
													></video>

													<!-- Guidelines overlay -->
													<div class="absolute inset-0 border-[28px] border-black/40 pointer-events-none flex items-center justify-center">
														<div class="w-[90%] h-[90%] border border-dashed border-white/50 rounded flex items-center justify-center">
															<span class="font-mono text-[8px] text-white/90 bg-black/60 px-2.5 py-1 rounded tracking-wider uppercase">
																Alinhe a guia médica
															</span>
														</div>
													</div>

													<!-- Shutter Trigger -->
													<div class="absolute bottom-4 flex justify-center w-full">
														<button
															type="button"
															onclick={capturarFotoScanner}
															class="h-12 w-12 rounded-full border-4 border-white bg-blue-600 shadow active:scale-95 transition-transform"
															title="Escanear pela Webcam"
														></button>
													</div>
												</div>
											{/if}
										</div>
									{/if}
								</div>
							{/if}
						</div>
					{/if}
				</div>

				<!-- Document List -->
				{#if anexos.length > 0}
					<div class="border border-slate-200">
						<div class="bg-slate-100 px-3 py-2 font-mono text-[10px] font-bold text-slate-700 tracking-widest uppercase border-b border-slate-200">
							LISTA DE ANEXOS ({anexos.length})
						</div>
						<ul class="divide-y divide-slate-100 bg-white font-sans">
							{#each anexos as an, i (an.id)}
								<li class="flex flex-wrap items-center justify-between gap-3 p-3 text-xs">
									<div class="flex items-center gap-3">
										<div class="flex h-8 w-8 items-center justify-center bg-slate-100 text-slate-500 font-bold border border-slate-200">
											{#if an.origem === 'upload'}
												📁
											{:else if an.origem === 'camera'}
												📷
											{:else}
												🖨️
											{/if}
										</div>
										<div class="leading-tight">
											<div class="font-mono font-bold text-slate-900 truncate max-w-[240px] md:max-w-[360px]" title={an.file.name}>
												{an.file.name}
											</div>
											<div class="text-[10px] text-slate-500">
												{(an.file.size / 1024).toFixed(1)} KB · Origem: <span class="font-semibold">{an.origem.toUpperCase()}</span>
											</div>
										</div>
									</div>

									<div class="flex items-center gap-2">
										<label class="flex items-center gap-1 font-mono text-[10px]">
											<span>TIPO:</span>
											<select
												bind:value={an.tipo}
												class="border border-slate-300 bg-white px-2 py-0.5 text-xs text-slate-900 focus:border-blue-900 focus:ring-1 focus:ring-blue-900"
											>
												<option value="COMPROVANTE_ENCAMINHAMENTO">Encaminhamento</option>
												<option value="EXAME">Exame</option>
												<option value="LAUDO">Laudo</option>
												<option value="OUTRO">Outro</option>
											</select>
										</label>

										{#if an.previewUrl}
											<button
												type="button"
												onclick={() => anexoVisualizar = an}
												class="border border-slate-300 bg-white px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-slate-700 uppercase hover:bg-slate-50"
											>
												Ver
											</button>
										{/if}

										<button
											type="button"
											onclick={() => removerAnexo(an.id)}
											class="border border-red-700 bg-red-50 px-2 py-0.5 font-mono text-[10px] font-bold tracking-widest text-red-800 uppercase hover:bg-red-100"
										>
											✕
										</button>
									</div>
								</li>
							{/each}
						</ul>
					</div>
				{:else}
					<div class="border-2 border-dashed border-slate-200 p-4 text-center text-xs font-mono text-slate-500 bg-white">
						Nenhum documento anexado ainda. Utilize uma das opções acima para adicionar.
					</div>
				{/if}
			</div>
		</div>

		<!-- Box de auditoria -->
		<div class="border-l-4 border-blue-900 bg-blue-50 px-4 py-2 font-sans text-[12px] text-blue-900">
			<strong class="font-mono tracking-widest uppercase">Próximo passo:</strong>
			a gestão TFD valida o cadastro, decide pela aprovação e aloca o paciente em uma viagem.
			Você acompanha tudo pelo Dashboard.
		</div>

		{#if enviando}
			<div class="border border-blue-900 bg-blue-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-blue-955 uppercase animate-pulse">
				{#if enviandoAnexos}
					⟳ ENVIANDO ANEXOS DO PACIENTE ({atualAnexoEnviar} DE {totalAnexosEnviar})... POR FAVOR AGUARDE.
				{:else}
					⟳ CRIANDO SOLICITAÇÃO CLÍNICA NO SISTEMA...
				{/if}
			</div>
		{/if}

		{#if erro}
			<div
				class="border border-red-700 bg-red-50 px-3 py-2 font-mono text-[11px] font-bold tracking-wider text-red-800 uppercase"
			>
				⚠ {erro}
			</div>
		{/if}

		<div class="flex flex-wrap justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3">
			<PrimaryButton
				label="Cancelar"
				variant="secondary"
				onclick={() => goto('/tfd/dashboard')}
				disabled={enviando}
			/>
			<PrimaryButton label="Cadastrar Solicitação" type="submit" loading={enviando} disabled={enviando} />
		</div>
	</form>
{/if}

<!-- Modal de visualização de anexo local -->
{#if anexoVisualizar}
	<Modal
		isOpen={!!anexoVisualizar}
		onClose={() => anexoVisualizar = null}
		title="Visualização do Documento"
		subtitle={anexoVisualizar.file.name}
		maxWidth="lg"
	>
		<div class="flex flex-col items-center justify-center p-2">
			{#if anexoVisualizar.previewUrl}
				<img
					src={anexoVisualizar.previewUrl}
					alt={anexoVisualizar.file.name}
					class="max-h-[70vh] object-contain border border-slate-300 shadow-md"
				/>
			{:else}
				<div class="p-8 text-center bg-slate-50 border border-slate-200 w-full text-slate-600 font-mono text-sm">
					Visualização indisponível para este tipo de arquivo.<br/>
					<span class="text-xs text-slate-400">Tipo: {anexoVisualizar.file.type || 'Desconhecido'}</span>
				</div>
			{/if}
			<div class="mt-4 flex justify-end w-full">
				<PrimaryButton
					label="Fechar"
					variant="secondary"
					onclick={() => anexoVisualizar = null}
				/>
			</div>
		</div>
	</Modal>
{/if}
