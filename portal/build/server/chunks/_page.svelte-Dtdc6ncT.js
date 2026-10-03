import { o as attr, f as escape_html, j as ensure_array_like } from './index.js-lpWxm-7g.js';

function FaqEntry($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { entry, categories } = $$props;
    let draft = { ...entry };
    let busy = false;
    const labels = {
      draft: "Vorschlag",
      approved: "Freigegeben",
      rejected: "Verworfen"
    };
    $$renderer2.push(`<article class="rounded-lg border border-gray-300 bg-gray-50/50 p-4 dark:border-slate-600 dark:bg-slate-800/40"><div class="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">Ticket #${escape_html(entry.sourceTicketNumber)} · ${escape_html(entry.categoryName)}</h2> <span class="rounded bg-gray-200 px-2 py-1 text-sm dark:bg-slate-700">${escape_html(labels[entry.status])}</span></div> <label class="block text-sm font-medium"${attr("for", "faq-question-" + entry.id)}>Frage</label> <textarea${attr("id", "faq-question-" + entry.id)} class="input form-textarea mt-1 min-h-20" maxlength="240">`);
    const $$body = escape_html(draft.question);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea> <label class="mt-3 block text-sm font-medium"${attr("for", "faq-answer-" + entry.id)}>Antwort</label> <textarea${attr("id", "faq-answer-" + entry.id)} class="input form-textarea mt-1 min-h-40" maxlength="1800">`);
    const $$body_1 = escape_html(draft.answer);
    if ($$body_1) {
      $$renderer2.push(`${$$body_1}`);
    }
    $$renderer2.push(`</textarea> <div class="mt-3 grid gap-3 sm:grid-cols-2"><div><label class="text-sm font-medium"${attr("for", "faq-scope-" + entry.id)}>Verwenden für</label> `);
    $$renderer2.select(
      {
        id: "faq-scope-" + entry.id,
        class: "input form-select mt-1",
        value: draft.categoryId
      },
      ($$renderer3) => {
        $$renderer3.option({ value: null }, ($$renderer4) => {
          $$renderer4.push(`Gesamter Server`);
        });
        if (entry.categoryId && !categories.some((category) => category.id === entry.categoryId)) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.option({ value: entry.categoryId }, ($$renderer4) => {
            $$renderer4.push(`Entfernte Kategorie – bitte neu zuordnen`);
          });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]--><!--[-->`);
        const each_array = ensure_array_like(categories);
        for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
          let category = each_array[$$index];
          $$renderer3.option({ value: category.id }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(category.name)}`);
          });
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</div> <div><label class="text-sm font-medium"${attr("for", "faq-language-" + entry.id)}>Sprache des FAQ-Textes</label> `);
    $$renderer2.select(
      {
        id: "faq-language-" + entry.id,
        class: "input form-select mt-1",
        value: draft.language
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "de" }, ($$renderer4) => {
          $$renderer4.push(`Deutsch`);
        });
        $$renderer3.option({ value: "en" }, ($$renderer4) => {
          $$renderer4.push(`Englisch`);
        });
        if (!["de", "en"].includes(entry.language)) {
          $$renderer3.push("<!--[0-->");
          $$renderer3.option({ value: entry.language }, ($$renderer4) => {
            $$renderer4.push(`${escape_html(entry.language)}`);
          });
        } else {
          $$renderer3.push("<!--[-1-->");
        }
        $$renderer3.push(`<!--]-->`);
      }
    );
    $$renderer2.push(`</div></div> <p class="mt-3 text-sm text-gray-500 dark:text-slate-400">Die KI verwendet diesen Eintrag erst nach deiner Freigabe. Prüfe besonders Regeln, Links und personenbezogene Angaben.</p> `);
    if (entry.evidence) {
      $$renderer2.push(`<!--[0--><div class="mt-2 flex flex-wrap gap-3 text-sm"><!--[-->`);
      const each_array_1 = ensure_array_like(JSON.parse(entry.evidence));
      for (let index = 0, $$length = each_array_1.length; index < $$length; index++) {
        let messageId = each_array_1[index];
        $$renderer2.push(`<a class="text-orange-600 hover:underline dark:text-orange-400"${attr("href", "https://discord.com/channels/" + entry.guildId + "/" + entry.sourceTicketId + "/" + messageId)} target="_blank" rel="noreferrer">Support-Antwort ${escape_html(index + 1)}</a>`);
      }
      $$renderer2.push(`<!--]--> <span class="text-gray-500 dark:text-slate-400">Bei gelöschten Kanälen im Transkript nachsehen.</span></div>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <div class="mt-4 flex flex-wrap gap-3"><button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700"${attr("disabled", busy, true)}>Änderungen speichern</button> `);
    if (entry.status !== "approved") {
      $$renderer2.push(`<!--[0--><button type="button" class="rounded bg-green-600 px-3 py-2 text-sm text-white"${attr("disabled", busy, true)}>In FAQ übernehmen</button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (entry.status === "approved") {
      $$renderer2.push(`<!--[0--><button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700"${attr("disabled", busy, true)}>Freigabe zurücknehmen</button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    if (entry.status !== "rejected") {
      $$renderer2.push(`<!--[0--><button type="button" class="rounded border border-red-500 px-3 py-2 text-sm text-red-600 dark:text-red-400"${attr("disabled", busy, true)}>Verwerfen</button>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></article>`);
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let results = data;
    let status = data.status;
    let search = data.search;
    let loading = false;
    let error = "";
    const labels = {
      queued: "Wartet",
      collecting: "Chat wird gelesen",
      processing: "Wird analysiert",
      done: "Abgeschlossen",
      failed: "Fehlgeschlagen"
    };
    const reasons = {
      CONFIG: "Gemini-Zugang ist nicht eingerichtet.",
      QUOTA: "Kein Kontingent verfügbar.",
      BUDGET: "Kostenbegrenzung erreicht.",
      PROVIDER: "Google ist nicht erreichbar oder hat die Anfrage abgelehnt.",
      MODEL: "Keine gültige Auswertung erhalten.",
      EVIDENCE: "Support-Nachweise oder Sprache waren nicht eindeutig.",
      RESTART: "Analyse wurde durch einen Neustart unterbrochen. Bitte den Command erneut ausführen.",
      NO_MESSAGES: "Kein erreichbarer Chatverlauf vorhanden.",
      FORBIDDEN: "Supportberechtigung fehlt.",
      CHANGED: "Ticket oder Kategorie wurde geändert.",
      ERROR: "Analyse konnte nicht abgeschlossen werden."
    };
    async function refresh(page = 1) {
      loading = true;
      error = "";
      try {
        const query = new URLSearchParams({ status, query: search, page: String(page) });
        const response = await fetch(data.api + "?" + query.toString(), { credentials: "include" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.message || "FAQ konnten nicht geladen werden.");
        results = body;
      } catch (failure) {
        error = failure.message;
      } finally {
        loading = false;
      }
    }
    $$renderer2.push(`<div class="mx-auto max-w-4xl"><h1 class="mb-3 text-2xl font-semibold">FAQ aus Tickets</h1> <p class="mb-2 text-sm text-gray-500 dark:text-slate-400">Mit <code>/faq-analyze</code> im Ticket oder <code>/faq-analyze ticket:NUMMER</code> den Verlauf auswerten. Nur zuständige Supporter und Administratoren können die Analyse starten. Hier prüfst du die vorgeschlagenen Fragen und bestätigten Antworten.</p> <p class="mb-5 text-sm text-gray-500 dark:text-slate-400">Freigegebene FAQ ergänzen sofort das Supportwissen der ausgewählten Kategorie oder des Servers. Vorschläge und verworfene Einträge werden von der KI nicht verwendet. Die Analyse teilt sich das Kontingent und Kostenlimit mit dem Erstsupport.</p> <div class="mb-5 flex flex-wrap items-end gap-3"><div><label class="block text-sm font-medium" for="faq-status">Anzeigen</label>`);
    $$renderer2.select(
      {
        id: "faq-status",
        class: "input form-select mt-1",
        value: status,
        onchange: () => refresh()
      },
      ($$renderer3) => {
        $$renderer3.option({ value: "draft" }, ($$renderer4) => {
          $$renderer4.push(`Vorschläge`);
        });
        $$renderer3.option({ value: "approved" }, ($$renderer4) => {
          $$renderer4.push(`Freigegebene FAQ`);
        });
        $$renderer3.option({ value: "rejected" }, ($$renderer4) => {
          $$renderer4.push(`Verworfen`);
        });
        $$renderer3.option({ value: "all" }, ($$renderer4) => {
          $$renderer4.push(`Alle Einträge`);
        });
      }
    );
    $$renderer2.push(`</div> <div class="min-w-48 flex-1"><label class="block text-sm font-medium" for="faq-search">FAQ durchsuchen</label><input id="faq-search" class="input mt-1"${attr("value", search)} maxlength="200"/></div> <button type="button" class="rounded bg-orange-600 px-4 py-2 text-sm text-white"${attr("disabled", loading, true)}>Suchen / Aktualisieren</button></div> `);
    if (error) {
      $$renderer2.push(`<!--[0--><p role="alert" class="mb-4 text-red-600 dark:text-red-400">${escape_html(error)}</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <p class="mb-3 text-sm text-gray-500 dark:text-slate-400">${escape_html(results.total)} ${escape_html(results.total === 1 ? "Eintrag" : "Einträge")} · Seite ${escape_html(results.page)}</p> <div class="space-y-5"><!--[-->`);
    const each_array = ensure_array_like(results.entries);
    for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
      let entry = each_array[$$index];
      FaqEntry($$renderer2, {
        entry,
        categories: results.categories,
        url: data.api
      });
    }
    $$renderer2.push(`<!--]--> `);
    if (!results.entries.length) {
      $$renderer2.push(`<!--[0--><p class="rounded-lg border border-gray-300 p-5 dark:border-slate-600">Keine Einträge in dieser Ansicht. Starte eine Analyse in Discord oder wähle einen anderen Filter.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> <div class="mt-4 flex gap-3"><button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700"${attr("disabled", loading || results.page <= 1, true)}>Vorherige Seite</button><button type="button" class="rounded bg-gray-200 px-3 py-2 text-sm dark:bg-slate-700"${attr("disabled", loading || results.page * results.pageSize >= results.total, true)}>Nächste Seite</button></div> <details class="mt-7 rounded-lg border border-gray-300 p-4 dark:border-slate-600" open=""><summary class="cursor-pointer font-semibold">Letzte Analysen</summary> <div class="mt-3 space-y-3"><!--[-->`);
    const each_array_1 = ensure_array_like(results.jobs);
    for (let $$index_1 = 0, $$length = each_array_1.length; $$index_1 < $$length; $$index_1++) {
      let job = each_array_1[$$index_1];
      $$renderer2.push(`<div class="border-t border-gray-200 pt-3 text-sm dark:border-slate-700"><p>Ticket #${escape_html(job.ticketNumber)} · ${escape_html(job.categoryName)} · ${escape_html(labels[job.state] || job.state)}</p><p class="text-gray-500 dark:text-slate-400">${escape_html(job.messageCount)} menschliche Textnachrichten · ${escape_html(job.proposals)} ${escape_html(job.proposals === 1 ? "neuer Vorschlag" : "neue Vorschläge")} · ${escape_html(new Date(job.createdAt).toLocaleString())}</p>`);
      if (job.truncated) {
        $$renderer2.push(`<!--[0--><p class="text-orange-600 dark:text-orange-400">Langer oder teilweise erreichbarer Verlauf: Nur der verfügbare Ausschnitt wurde ausgewertet (höchstens 500 Nachrichten).</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]-->`);
      if (job.errorCode) {
        $$renderer2.push(`<!--[0--><p class="text-orange-600 dark:text-orange-400">${escape_html(reasons[job.errorCode] || reasons.ERROR)}</p>`);
      } else {
        $$renderer2.push("<!--[-1-->");
      }
      $$renderer2.push(`<!--]--></div>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (!results.jobs.length) {
      $$renderer2.push(`<!--[0--><p class="text-sm text-gray-500 dark:text-slate-400">Noch keine Analyse gestartet.</p>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div></details> <details class="mt-5 rounded-lg border border-gray-300 p-4 dark:border-slate-600"><summary class="cursor-pointer font-semibold">Manuell hinterlegtes Supportwissen</summary><h2 class="mb-2 mt-4 font-medium">Server</h2><p class="whitespace-pre-wrap text-sm">${escape_html(results.serverKnowledge || "Noch kein Serverwissen hinterlegt.")}</p><a${attr("href", "/settings/" + data.guildId + "/general")} class="mt-2 inline-block text-sm text-orange-600 hover:underline dark:text-orange-400">Serverwissen bearbeiten</a><!--[-->`);
    const each_array_2 = ensure_array_like(results.categories);
    for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
      let category = each_array_2[$$index_2];
      $$renderer2.push(`<h2 class="mb-2 mt-4 font-medium">${escape_html(category.name)}</h2><p class="whitespace-pre-wrap text-sm">${escape_html(category.aiKnowledge || "Verwendet das Serverwissen.")}</p><a${attr("href", "/settings/" + data.guildId + "/categories/" + category.id)} class="mt-2 inline-block text-sm text-orange-600 hover:underline dark:text-orange-400">Kategorie bearbeiten</a>`);
    }
    $$renderer2.push(`<!--]--></details></div>`);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-Dtdc6ncT.js.map
