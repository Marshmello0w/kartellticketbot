<script>
	import { onMount } from 'svelte';
	let { settings = $bindable(), guildId } = $props();
	let status = $state(null);
	let loading = $state(false);
	let failed = $state(false);
	let connection = $state(null);
	let checking = $state(false);
	let checkFailed = $state(false);
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
	async function checkConnection(mode = 'metadata') {
		checking = true;
		checkFailed = false;
		connection = null;
		try {
			const response = await fetch(`/api/admin/guilds/${guildId}/ai`, {
				method: 'POST', credentials: 'include',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ mode }),
			});
			if (!response.ok) throw new Error();
			connection = await response.json();
		} catch { checkFailed = true; }
		finally { checking = false; }
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
	<p class="mt-1 text-sm text-gray-500 dark:text-slate-400">Eigene Kategorie-Texte ersetzen dieses Wissen. Zusätzlich nutzt der Bot passende freigegebene FAQ-Einträge. An Google gehen nur die aktuelle Frage und das passende Wissen, kein Chatverlauf. Dateien werden nicht von der KI gelesen.</p>
	{#if failed}<p class="mt-3 text-sm text-orange-600 dark:text-orange-400">Status konnte nicht geladen werden; bitte erneut aktualisieren.</p>{/if}
	{#if status}
		<p class="mt-3 text-sm">Kostenloser Zugang: <strong>{status.configured ? 'Eingerichtet' : 'Noch nicht eingerichtet'}</strong><br />Bezahlter Zugang: <strong>{status.paidConfigured ? 'Eingerichtet' : 'Ausgeschaltet'}</strong></p>
		<p class="mt-2 text-sm">Vom Bot erfasste Nutzung: {status.usedUsd.toFixed(4)} US-Dollar · Grenze: {status.limitUsd.toFixed(2)} US-Dollar<br />Ausstehende Aufgaben: {status.pending}</p>
		{#if status.resetsAt}<p class="mt-1 text-sm">Nächster Budgetzeitraum: {new Date(status.resetsAt).toLocaleString()}</p>{/if}
		{#if status.blocked}<p class="mt-1 text-sm text-orange-600 dark:text-orange-400">Bezahlte Antworten sind vorsorglich gesperrt. Das Team übernimmt.</p>{/if}
		{#if status.recentHandoffs?.length}
			<h3 class="mt-4 text-sm font-semibold">Letzte Übergaben an das Team</h3>
			<ul class="mt-2 space-y-2 text-sm">
				{#each status.recentHandoffs as handoff}
					<li class="rounded border border-gray-200 p-2 dark:border-slate-700">
						<strong>{handoff.ticketNumber === null ? 'Ticket' : 'Ticket #' + handoff.ticketNumber}</strong> · {new Date(handoff.occurredAt).toLocaleString()}<br />
						{handoff.message} <span class="text-gray-500 dark:text-slate-400">({handoff.code})</span>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
	<button type="button" class="mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400" onclick={refresh} disabled={loading}>{loading ? 'Status wird geladen…' : 'Status aktualisieren'}</button>
	<button type="button" class="ml-4 mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400" onclick={() => checkConnection()} disabled={checking}>{checking ? 'Verbindung wird geprüft…' : 'Verbindung prüfen'}</button>
	<button type="button" class="ml-4 mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400" onclick={() => checkConnection('generation')} disabled={checking}>Kostenlose Testantwort prüfen</button>
	{#if checkFailed}<p class="mt-2 text-sm text-orange-600 dark:text-orange-400">Die Verbindungsprüfung konnte nicht gestartet werden. Bitte erneut versuchen.</p>{/if}
	{#if connection}
		<div class="mt-3 rounded border border-gray-200 p-3 text-sm dark:border-slate-700" aria-live="polite">
			<p>Kostenloser Zugang: <strong>{connection.free.ok ? connection.mode === 'generation' ? 'Testantwort erfolgreich erzeugt' : 'Google erreichbar, Modell verfügbar' : 'Prüfung fehlgeschlagen'}</strong></p>
			{#if !connection.free.ok}<p class="mt-1 text-orange-600 dark:text-orange-400">{connection.free.message} ({connection.free.code})</p>{/if}
			{#if connection.paid}
				<p class="mt-2">Bezahlter Zugang: <strong>{connection.paid.ok ? 'Google erreichbar, Modell verfügbar' : 'Prüfung fehlgeschlagen'}</strong></p>
				{#if !connection.paid.ok}<p class="mt-1 text-orange-600 dark:text-orange-400">{connection.paid.message} ({connection.paid.code})</p>{/if}
			{/if}
			{#if connection.mode === 'generation'}
				<p class="mt-2 text-gray-500 dark:text-slate-400">Kurze vorgegebene Testfrage, wenige Tokens, ausschließlich über den kostenlosen Schlüssel. Keine Ticketinhalte und kein Wechsel zum bezahlten Zugang. Das Ergebnis wird bis zu einer Minute wiederverwendet.</p>
			{:else}
				<p class="mt-2 text-gray-500 dark:text-slate-400">Nur Schlüssel- und Modellzugriff geprüft: keine KI-Generierung, keine Tickettexte und kein Tokenverbrauch. Bei Fehlern erst beim Antworten „Kostenlose Testantwort prüfen“ verwenden.</p>
			{/if}
		</div>
	{/if}
	<p class="mt-2 text-sm text-gray-500 dark:text-slate-400">„Kostenlose Testantwort prüfen“ testet das Erzeugen einer Antwort mit einer kurzen vorgegebenen Frage. Dafür werden wenige Tokens des kostenlosen Kontingents verwendet.</p>
	<p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Einrichtung: zwei separate Google-Projekte und eine private Konfigurationsdatei auf dem Botserver. Das Abo enthält 10 US-Dollar, nicht 10 Euro. Die Standardgrenze beträgt 9,50 US-Dollar mit Reserve. Diese Anzeige ist kein Live-Guthabenstand von Google. Den bezahlten Zugang nur mit eingelöstem Guthaben und einem ausschließlich für diesen Bot verwendeten Projekt aktivieren.</p>
</section>
