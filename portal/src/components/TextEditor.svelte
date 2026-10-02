<script>
 import { beforeNavigate } from '$app/navigation';
 import { onMount } from 'svelte';
 let { data } = $props();
 let overrides = $state(JSON.parse(JSON.stringify(data.overrides)));
 let search = $state('');
 let group = $state('');
 let error = $state('');
 let notice = $state('');
 let saving = $state(false);
 let modified = $state(false);
 const names = { buttons: 'Buttons', text: 'Beschriftung', close: 'Schließen', accept_close_request: 'Schließung akzeptieren', reject_close_request: 'Schließung ablehnen', claim: 'Übernehmen', unclaim: 'Freigeben', edit: 'Bearbeiten', create: 'Ticket erstellen', cancel: 'Abbrechen', transcript: 'Transkript', confirm_open: 'Ticket bestätigen', ticket: 'Ticket', dm: 'Direktnachricht', modals: 'Formular', menus: 'Auswahl', misc: 'Hinweis', commands: 'Command', slash: '', message: '', user: '', title: 'Überschrift', description: 'Nachricht', fields: '', name: 'Bezeichnung', value: 'Inhalt', label: 'Beschriftung', placeholder: 'Eingabehinweis', staff_request: 'Anfrage des Teams', user_request: 'Anfrage des Nutzers', closed: 'Geschlossen', closing_soon: 'Baldige Schließung', inactive: 'Inaktivität', feedback: 'Feedback', rating: 'Bewertung', comment: 'Kommentar', created: 'Erstellt', offline: 'Team offline', working_hours: 'Supportzeiten', forbidden: 'Keine Berechtigung', not_staff: 'Kein Teammitglied', success: 'Bestätigung', wait_for_user: 'Auf Nutzer warten', wait_for_staff: 'Auf Team warten', rejected: 'Abgelehnt', topic: 'Thema', answers: 'Antworten', opening_message: 'Begrüßung', released: 'Freigegeben', claimed: 'Übernommen', response: 'Antwort', no_value: 'Kein Inhalt', edited: 'Bearbeitet', references_message: 'Nachrichtenverweis', references_ticket: 'Ticketverweis' };
 const label = key => key.split('.').map(part => names[part] ?? part.replaceAll('_', ' ')).filter(Boolean).join(' · ');
 const inherited = field => data.inherited[field.key] ?? field.defaultValue;
 const value = field => overrides[field.key] ?? inherited(field);
 const groups = [...new Set(data.catalog.map(field => field.group))];
 let fields = $derived(data.catalog.filter(field => (!group || field.group === group) && `${label(field.key)} ${field.key} ${JSON.stringify(value(field))}`.toLowerCase().includes(search.toLowerCase())));
 function change(field, text, index = null) {
  if (index === null) overrides[field.key] = text;
  else { const values = [...value(field)]; values[index] = text; overrides[field.key] = values; }
  modified = true; notice = '';
 }
 function reset(field) { delete overrides[field.key]; modified = true; notice = ''; }
 function preview(text) {
  return text.replace(/\{\{?\s*([\w.:-]+)\s*\}\}?/g, (_, name) => ({ user: '@Nutzer', requestedBy: '@Team', channel: '#ticket-42', number: '42', timestamp: '1790935200', time: '12 Stunden', command: '/new', url: 'https://example.com/settings' }[name] || `[${name}]`)).replace(/%d/g, '2').replace(/%s/g, 'Beispiel');
 }
 async function save() {
  saving = true; error = ''; notice = '';
  try {
   const response = await fetch(data.url, { method: 'PATCH', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ overrides }) });
   const body = await response.json();
   if (!response.ok) throw new Error(body.message || 'Speichern fehlgeschlagen.');
   data = { ...data, ...body }; overrides = JSON.parse(JSON.stringify(body.overrides)); modified = false; notice = 'Texte gespeichert. Neue Bot-Nachrichten verwenden diese Texte.';
  } catch (failure) { error = failure.message; }
  finally { saving = false; }
 }
 beforeNavigate(navigation => { if (modified && !confirm('Du hast ungespeicherte Texte. Möchtest du die Seite verlassen?')) navigation.cancel(); });
 onMount(() => {
  const warn = event => { if (modified) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
 });
</script>

<div class="mx-auto max-w-4xl px-4 pb-12">
 <h1 class="mb-3 text-3xl font-bold">{data.categoryName ? `Texte für ${data.categoryName}` : 'Supporttexte für den Server'}</h1>
 <p class="mb-6 text-gray-600 dark:text-slate-300">{data.categoryName ? 'Schreibe hier die Texte für diese Kategorie. Nicht angepasste Felder übernehmen die Servertexte.' : 'Diese Texte gelten für alle Kategorien, die keine eigenen Texte hinterlegt haben.'} Änderungen gelten für neue Nachrichten; bestehende Buttons bleiben unverändert.</p>
 <div class="sticky top-0 z-10 mb-6 rounded-xl bg-gray-100 p-4 shadow-sm dark:bg-slate-800">
  <div class="flex flex-wrap items-end gap-4">
   <label class="grow">Text suchen<input class="input form-input block" type="search" bind:value={search} placeholder="Zum Beispiel Schließen oder Feedback" /></label>
   <label>Bereich<select class="input form-select block" bind:value={group}><option value="">Alle Bereiche</option>{#each groups as item}<option>{item}</option>{/each}</select></label>
   <button class="rounded-lg bg-blurple px-5 py-2 font-semibold text-white disabled:opacity-50" type="button" onclick={save} disabled={saving || !modified}>{saving ? 'Speichert …' : 'Texte speichern'}</button>
  </div>
  {#if error}<p role="alert" class="mt-3 text-red-600 dark:text-red-400">{error}</p>{/if}
  {#if notice}<p role="status" class="mt-3 text-green-700 dark:text-green-400">{notice}</p>{/if}
 </div>
 {#each fields as field (field.key)}
  <section class="mb-5 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-700">
   <div class="mb-3 flex flex-wrap items-start justify-between gap-2">
    <div><h2 class="font-semibold">{label(field.key)}</h2><p class="text-sm text-gray-500 dark:text-slate-400">{field.group} · {Object.hasOwn(overrides, field.key) ? 'Eigener Text' : data.inherited[field.key] !== undefined ? 'Servertext' : 'Standardtext'}</p></div>
    <button type="button" class="text-sm underline disabled:opacity-40" disabled={!Object.hasOwn(overrides, field.key)} onclick={() => reset(field)}>Auf Standard zurücksetzen</button>
   </div>
   {#each (Array.isArray(value(field)) ? value(field) : [value(field)]) as text, index}
    <label class="block">{#if Array.isArray(value(field))}<span class="text-sm">{value(field).length === 3 ? ['Keine', 'Einzahl', 'Mehrzahl'][index] : ['Einzahl', 'Mehrzahl'][index]}</span>{/if}
     <textarea class="input form-textarea block min-h-20 w-full" rows={text.includes('\n') ? 5 : 2} maxlength={field.maxLength} value={text} oninput={event => change(field, event.currentTarget.value, Array.isArray(value(field)) ? index : null)} aria-label={label(field.key) + (Array.isArray(value(field)) ? ` Variante ${index + 1}` : '')}></textarea>
    </label>
    <p class="mt-1 text-right text-xs text-gray-500 dark:text-slate-400">{text.length} / {field.maxLength} Zeichen</p>
    <details class="mb-2 text-sm"><summary class="cursor-pointer text-gray-600 dark:text-slate-300">Vorschau mit Beispieldaten</summary><div class="mt-2 whitespace-pre-wrap rounded-lg bg-gray-100 p-3 dark:bg-slate-800">{preview(text)}</div></details>
   {/each}
   {#if field.placeholders.length}<p class="text-sm text-gray-500 dark:text-slate-400">Verfügbare Platzhalter: {field.placeholders.join(', ')}</p>{/if}
  </section>
 {:else}<p class="py-8 text-center">Keine passenden Texte gefunden.</p>{/each}
</div>
