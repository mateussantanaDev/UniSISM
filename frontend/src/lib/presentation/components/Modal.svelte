<script lang="ts">
	import { dialogAccessibility } from '$lib/presentation/actions/dialogAccessibility';
	const dialogId = $props.id();
	interface Props {
		isOpen?: boolean;
		onClose?: () => void;
		title: string;
		subtitle?: string;
		children?: import('svelte').Snippet;
		maxWidth?: 'sm' | 'md' | 'lg' | 'xl';
		closable?: boolean;
	}

	let {
		isOpen = false,
		onClose,
		title,
		subtitle = '',
		children,
		maxWidth = 'md',
		closable = true
	}: Props = $props();

	const widths = {
		sm: 'max-w-md',
		md: 'max-w-2xl',
		lg: 'max-w-3xl',
		xl: 'max-w-5xl'
	};

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget && closable && onClose) {
			onClose();
		}
	}

</script>


{#if isOpen}
	<div
		class="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/60 px-2 py-3 sm:px-4 sm:py-10"
		role="presentation"
		onclick={handleBackdrop}
	>
		<div
			role="dialog"
			aria-modal="true"
			aria-labelledby={`${dialogId}-title`}
			aria-describedby={subtitle ? `${dialogId}-description` : undefined}
			use:dialogAccessibility={{ label: title, onClose, closable }}
			class="flex max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-5rem)] w-full {widths[
				maxWidth
			]} flex-col border-2 border-slate-900 bg-white shadow-[8px_8px_0_rgba(15,23,42,0.12)]"
		>
			<div
				class="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 sm:px-6 sm:py-4"
			>
				<div>
					<h2 id={`${dialogId}-title`} class="font-mono text-sm font-bold tracking-wide text-slate-900 uppercase">
						{title}
					</h2>
					{#if subtitle}
						<p id={`${dialogId}-description`} class="mt-0.5 text-xs text-slate-600">{subtitle}</p>
					{/if}
				</div>
				{#if closable}
					<button
						type="button"
						onclick={onClose}
						class="text-slate-500 hover:text-slate-900"
						aria-label="Fechar"
					>
						<svg
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							stroke-width="2"
							stroke="currentColor"
							class="h-5 w-5"
						>
							<path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
						</svg>
					</button>
				{/if}
			</div>

			<div class="flex-1 overflow-y-auto">
				{#if children}
					<div class="p-4 sm:p-6">
						{@render children()}
					</div>
				{/if}
			</div>
		</div>
	</div>
{/if}
