/** Focus lifecycle for the app's custom modal overlays, including nested dialogs. */
interface DialogOptions {
	label: string;
	onClose?: () => void;
	closable?: boolean;
}
const openDialogs: HTMLElement[] = [];
let originalOverflow = '';

export function dialogAccessibility(node: HTMLElement, initial: DialogOptions) {
	let options = initial;
	const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
	let disposed = false;
	node.setAttribute('role', 'dialog');
	node.setAttribute('aria-modal', 'true');
	node.tabIndex = -1;
	if (!node.hasAttribute('aria-labelledby')) node.setAttribute('aria-label', options.label);
	if (openDialogs.length === 0) {
		originalOverflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
	}
	openDialogs.push(node);
	const top = () => openDialogs.at(-1) === node;
	const focusable = () => Array.from(node.querySelectorAll<HTMLElement>('a[href],button,input,select,textarea,[tabindex]')).filter((e) =>
		!e.hasAttribute('disabled') && e.tabIndex >= 0 && e.getClientRects().length > 0 && !e.closest('[inert]')
	);
	const focusFirst = () => (focusable()[0] || node).focus();
	queueMicrotask(() => { if (!disposed && top()) focusFirst(); });
	const keydown = (event: KeyboardEvent) => {
		if (!top()) return;
		if (event.key === 'Escape' && options.closable !== false && options.onClose) {
			event.preventDefault();
			event.stopImmediatePropagation();
			options.onClose();
		} else if (event.key === 'Tab') {
			const controls = focusable();
			const first = controls[0], last = controls.at(-1);
			if (!first || !last) { event.preventDefault(); node.focus(); }
			else if (event.shiftKey && (document.activeElement === first || document.activeElement === node)) { event.preventDefault(); last.focus(); }
			else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
		}
	};
	const focusin = (event: FocusEvent) => {
		if (top() && event.target instanceof Node && !node.contains(event.target)) focusFirst();
	};
	document.addEventListener('keydown', keydown, true);
	document.addEventListener('focusin', focusin);
	return {
		update(next: DialogOptions) {
			options = next;
			if (!node.hasAttribute('aria-labelledby')) node.setAttribute('aria-label', options.label);
		},
		destroy() {
			disposed = true;
			const wasTop = top();
			const index = openDialogs.indexOf(node);
			if (index >= 0) openDialogs.splice(index, 1);
			document.removeEventListener('keydown', keydown, true);
			document.removeEventListener('focusin', focusin);
			if (openDialogs.length === 0) document.body.style.overflow = originalOverflow;
			if (wasTop && previous?.isConnected) previous.focus();
		}
	};
}
