<script lang="ts">
	import EncaminhamentoExplorer from '$lib/presentation/components/EncaminhamentoExplorer.svelte';

	/**
	 * Solicitações Recebidas — explorador hierárquico estilo file-manager.
	 *
	 * Backend (v0.9.1): chama `/v1/encaminhamentos/arvore?excluirRascunho=true`
	 * em cada nível, descendo só o necessário. O atendente abre o caso e
	 * segue o fluxo no detalhe simplificado.
	 */
</script>

<EncaminhamentoExplorer
	basePath="/sms/solicitacoes"
	titulo="Solicitações Recebidas"
	subtitulo="Encaminhamentos enviados pelas UBSs · UBS · Ano · Mês · Dia"
	emojiVazio="📥"
	mensagemVazio="Nenhuma solicitação recebida ainda."
	excluirRascunho
	tipoFiltro="solicitacoes"
	detalheBasePath="/sms/encaminhamento"
	dica="Clique em uma UBS para abrir os anos com solicitações. No último nível você consulta cada caso."
/>
