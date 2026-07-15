<script lang="ts">
	import EncaminhamentoExplorer from '$lib/presentation/components/EncaminhamentoExplorer.svelte';
</script>

<svelte:head>
	<title>Encaminhamentos Enviados · UNISISM</title>
</svelte:head>

<EncaminhamentoExplorer
	basePath="/sms/enviados"
	titulo="Encaminhamentos Enviados"
	subtitulo="Aguardando retorno do SUS ou de Centros Municipais · UBS · Ano · Mês · Dia"
	emojiVazio="📤"
	mensagemVazio="Nenhum encaminhamento enviado no momento."
	excluirRascunho
	tipoFiltro="enviados"
	detalheBasePath="/sms/encaminhamento"
	dica="Selecione uma UBS para consultar a árvore de encaminhamentos enviados aguardando resposta."
/>
