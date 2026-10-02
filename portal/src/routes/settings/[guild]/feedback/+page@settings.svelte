<script>
	let { data } = $props();
	let feedback = $derived(data.feedback);
	let pages = $derived(Math.max(1, Math.ceil(feedback.total / feedback.pageSize)));
	const formatDate = date => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(date));
</script>

<div class="mx-auto max-w-4xl px-4 pb-12">
	<a href={`/settings/${feedback.guild.id}`} class="mb-6 inline-block text-gray-600 underline dark:text-slate-300">← {feedback.guild.name}</a>
	<h1 class="mb-2 text-3xl font-bold">Feedback</h1>
	<p class="mb-6 text-gray-600 dark:text-slate-300">Bewertungen und Kommentare aus den Support-Tickets · {feedback.total} {feedback.total === 1 ? 'Eintrag' : 'Einträge'}</p>
	{#each feedback.entries as entry (entry.ticketId)}
		<article class="mb-5 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-700">
			<div class="mb-3 flex flex-wrap items-start justify-between gap-2">
				<div><h2 class="font-semibold">{entry.category} · Ticket #{entry.number}</h2><p class="text-sm text-gray-500 dark:text-slate-300">{entry.userName} · <time datetime={entry.createdAt}>{formatDate(entry.createdAt)}</time></p></div>
				<p class="font-semibold text-amber-600 dark:text-amber-300" aria-label={`Bewertung: ${entry.rating} von 5`}>{'★'.repeat(Math.min(5, Math.max(0, entry.rating)))} <span class="text-gray-600 dark:text-slate-300">{entry.rating}/5</span></p>
			</div>
			{#if entry.commentUnavailable}<p class="text-amber-700 dark:text-amber-300">Der Kommentar konnte nicht gelesen werden.</p>
			{:else if entry.comment}<p class="whitespace-pre-wrap break-words">{entry.comment}</p>
			{:else}<p class="text-gray-500 dark:text-slate-300">Kein Kommentar hinterlassen.</p>{/if}
		</article>
	{:else}<p class="rounded-xl bg-white p-8 text-center text-gray-600 shadow-sm dark:bg-slate-700 dark:text-slate-300">{feedback.total === 0 ? 'Bisher wurde kein Feedback abgegeben.' : 'Auf dieser Seite gibt es keine Einträge.'}</p>{/each}
	{#if feedback.total > feedback.pageSize || feedback.page > 1}
		<nav aria-label="Feedback-Seiten" class="mt-6 flex items-center justify-between gap-4">
			{#if feedback.page > 1}<a class="underline" href={`?page=${feedback.page - 1}`}>← Vorherige Seite</a>{:else}<span></span>{/if}
			<p class="text-gray-600 dark:text-slate-300">Seite {feedback.page} von {pages}</p>
			{#if feedback.page < pages}<a class="underline" href={`?page=${feedback.page + 1}`}>Nächste Seite →</a>{:else}<span></span>{/if}
		</nav>
	{/if}
</div>
