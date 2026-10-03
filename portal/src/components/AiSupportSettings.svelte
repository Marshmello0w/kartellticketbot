<script>
	import { onMount } from 'svelte';
	let { settings = $bindable(), guildId } = $props();
	let status = $state(null);
	let loading = $state(false);
	let failed = $state(false);
	async function refresh() {
		loading = true;
		try {
			const response = await fetch(`/api/admin/guilds/${guildId}/ai`, { credentials: 'include' });
			if (!response.ok) throw new Error();
			status = await response.json();
			failed = false;
		} catch { failed = true; }
		finally { loading = false; }
	}
	onMount(refresh);
</script>

<section class="rounded-lg border border-gray-300 p-4 dark:border-slate-600">
	<h2 class="mb-3 font-semibold">KI-Erstsupport mit Gemini</h2>
	<a class="mb-3 inline-block text-sm text-orange-600 hover:underline dark:text-orange-400" href={'/settings/' + guildId + '/faq'}>FAQ aus Tickets prüfen und verwalten</a>
	<label class="flex items-center gap-3">
		<input type="checkbox" class="form-checkbox" bind:checked={settings.aiSupportEnabled} />
		<span>Neue Tickets zuerst von der KI beantworten lassen</span>
	</label>
	<p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Kostenloser Zugang → begrenztes Abo-Guthaben → menschlicher Support. Höchstens drei KI-Antworten pro Ticket. Sobald ein Supporter antwortet oder das Ticket übernimmt, endet die KI-Hilfe. Bestehende Tickets bleiben beim Team.</p>
	<label class="mt-4 block font-medium" for="ai-server-knowledge">FAQ und Regeln für den Support</label>
	<textarea id="ai-server-knowledge" class="input form-textarea mt-2 min-h-48 font-normal" bind:value={settings.aiKnowledge} maxlength="12000" placeholder="Trage hier bekannte Fragen, Antworten, Regeln und hilfreiche Links ein."></textarea>
	<p class="mt-1 text-sm text-gray-500 dark:text-slate-400">Eigene Kategorie-Texte ersetzen dieses Wissen. Ohne passendes Wissen übernimmt ein Mensch. Tickettexte werden zur Beantwortung an Google gesendet; Dateien werden nicht von der KI gelesen.</p>
	{#if failed}<p class="mt-3 text-sm text-orange-600 dark:text-orange-400">Status konnte nicht geladen werden; bitte erneut aktualisieren.</p>{/if}
	{#if status}
		<p class="mt-3 text-sm">Kostenloser Zugang: <strong>{status.configured ? 'Eingerichtet' : 'Noch nicht eingerichtet'}</strong><br />Bezahlter Zugang: <strong>{status.paidConfigured ? 'Eingerichtet' : 'Ausgeschaltet'}</strong></p>
		<p class="mt-2 text-sm">Vom Bot erfasste Nutzung: {status.usedUsd.toFixed(4)} US-Dollar · Grenze: {status.limitUsd.toFixed(2)} US-Dollar<br />Ausstehende Aufgaben: {status.pending}</p>
		{#if status.resetsAt}<p class="mt-1 text-sm">Nächster Budgetzeitraum: {new Date(status.resetsAt).toLocaleString()}</p>{/if}
		{#if status.blocked}<p class="mt-1 text-sm text-orange-600 dark:text-orange-400">Bezahlte Antworten sind vorsorglich gesperrt. Das Team übernimmt.</p>{/if}
	{/if}
	<button type="button" class="mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400" onclick={refresh} disabled={loading}>{loading ? 'Status wird geladen…' : 'Status aktualisieren'}</button>
	<p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Einrichtung: zwei separate Google-Projekte und eine private Konfigurationsdatei auf dem Botserver. Das Abo enthält 10 US-Dollar, nicht 10 Euro. Die Standardgrenze beträgt 9,50 US-Dollar mit Reserve. Diese Anzeige ist kein Live-Guthabenstand von Google. Den bezahlten Zugang nur mit eingelöstem Guthaben und einem ausschließlich für diesen Bot verwendeten Projekt aktivieren.</p>
</section>
