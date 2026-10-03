<script>
	import FaqEntry from '$components/FaqEntry.svelte';
	let { data } = $props();
	let results = $state(data), status = $state(data.status), search = $state(data.search), loading = $state(false), error = $state('');
	$effect(() => { results = data; status = data.status; search = data.search; });
	const labels = { queued: 'Wartet', collecting: 'Chat wird gelesen', processing: 'Wird analysiert', done: 'Abgeschlossen', failed: 'Fehlgeschlagen' };
	const reasons = { CONFIG: 'Gemini-Zugang ist nicht eingerichtet.', QUOTA: 'Kein Kontingent verfügbar.', BUDGET: 'Kostenbegrenzung erreicht.', PROVIDER: 'Google ist nicht erreichbar oder hat die Anfrage abgelehnt.', MODEL: 'Keine gültige Auswertung erhalten.', EVIDENCE: 'Support-Nachweise oder Sprache waren nicht eindeutig.', RESTART: 'Analyse wurde durch einen Neustart unterbrochen. Bitte den Command erneut ausführen.', NO_MESSAGES: 'Kein erreichbarer Chatverlauf vorhanden.', FORBIDDEN: 'Supportberechtigung fehlt.', CHANGED: 'Ticket oder Kategorie wurde geändert.', ERROR: 'Analyse konnte nicht abgeschlossen werden.' };
	async function refresh(page = 1) {
		loading = true; error = '';
		try {
			const query = new URLSearchParams({ status, query: search, page: String(page) });
			const response = await fetch(data.api + '?' + query.toString(), { credentials: 'include' });
			const body = await response.json();
			if (!response.ok) throw new Error(body.message || 'FAQ konnten nicht geladen werden.');
			results = body;
		} catch (failure) { error = failure.message; }
		finally { loading = false; }
	}
</script>

<div class="mx-auto max-w-4xl">
	<h1 class="mb-3 text-2xl font-semibold">FAQ aus Tickets</h1>
	<p class="mb-2 text-sm text-gray-500 dark:text-slate-400">Mit <code>/faq-analyze</code> im Ticket oder <code>/faq-analyze ticket:NUMMER</code> den Verlauf auswerten. Nur zuständige Supporter und Administratoren können die Analyse starten. Hier prüfst du die vorgeschlagenen Fragen und bestätigten Antworten.</p>
	<p class="mb-5 text-sm text-gray-500 dark:text-slate-400">Freigegebene FAQ ergänzen sofort das Supportwissen der ausgewählten Kategorie oder des Servers. Vorschläge und verworfene Einträge werden von der KI nicht verwendet. Die Analyse teilt sich das Kontingent und Kostenlimit mit dem Erstsupport.</p>
	<div class="mb-5 flex flex-wrap items-end gap-3">
		<div><label class="block text-sm font-medium" for="faq-status">Anzeigen</label><select id="faq-status" class="input form-select mt-1" bind:value={status} onchange={() => refresh()}><option value="draft">Vorschläge</option><option value="approved">Freigegebene FAQ</option><option value="rejected">Verworfen</option><option value="all">Alle Einträge</option></select></div>
		<div class="min-w-48 flex-1"><label class="block text-sm font-medium" for="faq-search">FAQ durchsuchen</label><input id="faq-search" class="input mt-1" bind:value={search} maxlength="200" onkeydown={event => { if (event.key === 'Enter') refresh(); }} /></div>
		<button type="button" class="rounded bg-orange-600 px-4 py-2 text-sm text-white" disabled={loading} onclick={() => refresh()}>Suchen / Aktualisieren</button>
	</div>
	{#if error}<p role="alert" class="mb-4 text-red-600 dark:text-red-400">{error}</p>{/if}
	<p class="mb-3 text-sm text-gray-500 dark:text-slate-400">{results.total} {results.total === 1 ? 'Eintrag' : 'Einträge'} · Seite {results.page}</p>
	<div class="space-y-5">
		{#each results.entries as entry (entry.id + entry.updatedAt)}<FaqEntry {entry} categories={results.categories} url={data.api} onSaved={() => refresh(results.page)} />{/each}
		{#if !results.entries.length}<p class="rounded-lg border border-gray-300 p-5 dark:border-slate-600">Keine Einträge in dieser Ansicht. Starte eine Analyse in Discord oder wähle einen anderen Filter.</p>{/if}
	</div>
	<div class="mt-4 flex gap-3"><button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700" disabled={loading || results.page <= 1} onclick={() => refresh(results.page - 1)}>Vorherige Seite</button><button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700" disabled={loading || results.page * results.pageSize >= results.total} onclick={() => refresh(results.page + 1)}>Nächste Seite</button></div>
	<details class="mt-7 rounded-lg border border-gray-300 p-4 dark:border-slate-600" open>
		<summary class="cursor-pointer font-semibold">Letzte Analysen</summary>
		<div class="mt-3 space-y-3">
			{#each results.jobs as job}<div class="border-t border-gray-200 pt-3 text-sm dark:border-slate-700"><p>Ticket #{job.ticketNumber} · {job.categoryName} · {labels[job.state] || job.state}</p><p class="text-gray-500 dark:text-slate-400">{job.messageCount} menschliche Textnachrichten · {job.proposals} {job.proposals === 1 ? 'neuer Vorschlag' : 'neue Vorschläge'} · {new Date(job.createdAt).toLocaleString()}</p>{#if job.truncated}<p class="text-orange-600 dark:text-orange-400">Langer oder teilweise erreichbarer Verlauf: Nur der verfügbare Ausschnitt wurde ausgewertet (höchstens 500 Nachrichten).</p>{/if}{#if job.errorCode}<p class="text-orange-600 dark:text-orange-400">{reasons[job.errorCode] || reasons.ERROR}</p>{/if}</div>{/each}
			{#if !results.jobs.length}<p class="text-sm text-gray-500 dark:text-slate-400">Noch keine Analyse gestartet.</p>{/if}
		</div>
	</details>
	<details class="mt-5 rounded-lg border border-gray-300 p-4 dark:border-slate-600"><summary class="cursor-pointer font-semibold">Manuell hinterlegtes Supportwissen</summary><h2 class="mb-2 mt-4 font-medium">Server</h2><p class="whitespace-pre-wrap text-sm">{results.serverKnowledge || 'Noch kein Serverwissen hinterlegt.'}</p><a href={'/settings/' + data.guildId + '/general'} class="mt-2 inline-block text-sm text-orange-600 hover:underline dark:text-orange-400">Serverwissen bearbeiten</a>{#each results.categories as category}<h2 class="mb-2 mt-4 font-medium">{category.name}</h2><p class="whitespace-pre-wrap text-sm">{category.aiKnowledge || 'Verwendet das Serverwissen.'}</p><a href={'/settings/' + data.guildId + '/categories/' + category.id} class="mt-2 inline-block text-sm text-orange-600 hover:underline dark:text-orange-400">Kategorie bearbeiten</a>{/each}</details>
</div>
