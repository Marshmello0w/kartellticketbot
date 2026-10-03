<script>
	let { entry, categories, url, onSaved } = $props();
	let draft = $state({ ...entry });
	let busy = $state(false), error = $state('');
	const labels = { draft: 'Vorschlag', approved: 'Freigegeben', rejected: 'Verworfen' };
	async function save(status) {
		busy = true; error = '';
		try {
			const response = await fetch(url + '/' + entry.id, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...draft, status, categoryId: draft.categoryId === '' || draft.categoryId === null ? null : Number(draft.categoryId) }) });
			const result = await response.json();
			if (!response.ok) throw new Error(result.message || 'Speichern fehlgeschlagen.');
			draft = { ...result };
			await onSaved();
		} catch (failure) { error = failure.message; }
		finally { busy = false; }
	}
</script>

<article class="rounded-lg border border-gray-300 bg-gray-50/50 p-4 dark:border-slate-600 dark:bg-slate-800/40">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="font-semibold">Ticket #{entry.sourceTicketNumber} · {entry.categoryName}</h2>
		<span class="rounded bg-gray-200 px-2 py-1 text-sm dark:bg-slate-700">{labels[entry.status]}</span>
	</div>
	<label class="block text-sm font-medium" for={'faq-question-' + entry.id}>Frage</label>
	<textarea id={'faq-question-' + entry.id} class="input form-textarea mt-1 min-h-20" bind:value={draft.question} maxlength="240"></textarea>
	<label class="mt-3 block text-sm font-medium" for={'faq-answer-' + entry.id}>Antwort</label>
	<textarea id={'faq-answer-' + entry.id} class="input form-textarea mt-1 min-h-40" bind:value={draft.answer} maxlength="1800"></textarea>
	<div class="mt-3 grid gap-3 sm:grid-cols-2">
		<div>
			<label class="text-sm font-medium" for={'faq-scope-' + entry.id}>Verwenden für</label>
			<select id={'faq-scope-' + entry.id} class="input form-select mt-1" bind:value={draft.categoryId}>
				<option value={null}>Gesamter Server</option>
				{#if entry.categoryId && !categories.some(category => category.id === entry.categoryId)}<option value={entry.categoryId}>Entfernte Kategorie – bitte neu zuordnen</option>{/if}
				{#each categories as category}<option value={category.id}>{category.name}</option>{/each}
			</select>
		</div>
		<div>
			<label class="text-sm font-medium" for={'faq-language-' + entry.id}>Sprache des FAQ-Textes</label>
			<select id={'faq-language-' + entry.id} class="input form-select mt-1" bind:value={draft.language}>
				<option value="de">Deutsch</option><option value="en">Englisch</option>
				{#if !['de', 'en'].includes(entry.language)}<option value={entry.language}>{entry.language}</option>{/if}
			</select>
		</div>
	</div>
	<p class="mt-3 text-sm text-gray-500 dark:text-slate-400">Die KI verwendet diesen Eintrag erst nach deiner Freigabe. Prüfe besonders Regeln, Links und personenbezogene Angaben.</p>
	{#if entry.evidence}
		<div class="mt-2 flex flex-wrap gap-3 text-sm">
			{#each JSON.parse(entry.evidence) as messageId, index}<a class="text-orange-600 hover:underline dark:text-orange-400" href={'https://discord.com/channels/' + entry.guildId + '/' + entry.sourceTicketId + '/' + messageId} target="_blank" rel="noreferrer">Support-Antwort {index + 1}</a>{/each}
			<span class="text-gray-500 dark:text-slate-400">Bei gelöschten Kanälen im Transkript nachsehen.</span>
		</div>
	{/if}
	{#if error}<p role="alert" class="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>{/if}
	<div class="mt-4 flex flex-wrap gap-3">
		<button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700" disabled={busy} onclick={() => save(entry.status)}>Änderungen speichern</button>
		{#if entry.status !== 'approved'}<button type="button" class="rounded bg-green-600 px-3 py-2 text-sm text-white" disabled={busy} onclick={() => save('approved')}>In FAQ übernehmen</button>{/if}
		{#if entry.status === 'approved'}<button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700" disabled={busy} onclick={() => save('draft')}>Freigabe zurücknehmen</button>{/if}
		{#if entry.status !== 'rejected'}<button type="button" class="rounded border border-red-500 px-3 py-2 text-sm text-red-600 dark:text-red-400" disabled={busy} onclick={() => save('rejected')}>Verwerfen</button>{/if}
	</div>
</article>
