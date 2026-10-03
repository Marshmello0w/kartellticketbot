import { o as attr, f as escape_html, j as ensure_array_like, p as derived } from './index.js-HgvztdR9.js';

function _page_settings($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let feedback = derived(() => data.feedback);
    let pages = derived(() => Math.max(1, Math.ceil(feedback().total / feedback().pageSize)));
    const formatDate = (date) => new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(date));
    $$renderer2.push(`<div class="mx-auto max-w-4xl px-4 pb-12"><a${attr("href", `/settings/${feedback().guild.id}`)} class="mb-6 inline-block text-gray-600 underline dark:text-slate-300">← ${escape_html(feedback().guild.name)}</a> <h1 class="mb-2 text-3xl font-bold">Feedback</h1> <p class="mb-6 text-gray-600 dark:text-slate-300">Bewertungen und Kommentare aus den Support-Tickets · ${escape_html(feedback().total)} ${escape_html(feedback().total === 1 ? "Eintrag" : "Einträge")}</p> `);
    const each_array = ensure_array_like(feedback().entries);
    if (each_array.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let entry = each_array[$$index];
        $$renderer2.push(`<article class="mb-5 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-700"><div class="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 class="font-semibold">${escape_html(entry.category)} · Ticket #${escape_html(entry.number)}</h2><p class="text-sm text-gray-500 dark:text-slate-300">${escape_html(entry.userName)} · <time${attr("datetime", entry.createdAt)}>${escape_html(formatDate(entry.createdAt))}</time></p></div> <p class="font-semibold text-amber-600 dark:text-amber-300"${attr("aria-label", `Bewertung: ${entry.rating} von 5`)}>${escape_html("★".repeat(Math.min(5, Math.max(0, entry.rating))))} <span class="text-gray-600 dark:text-slate-300">${escape_html(entry.rating)}/5</span></p></div> `);
        if (entry.commentUnavailable) {
          $$renderer2.push(`<!--[0--><p class="text-amber-700 dark:text-amber-300">Der Kommentar konnte nicht gelesen werden.</p>`);
        } else if (entry.comment) {
          $$renderer2.push(`<!--[1--><p class="whitespace-pre-wrap break-words">${escape_html(entry.comment)}</p>`);
        } else {
          $$renderer2.push(`<!--[-1--><p class="text-gray-500 dark:text-slate-300">Kein Kommentar hinterlassen.</p>`);
        }
        $$renderer2.push(`<!--]--></article>`);
      }
    } else {
      $$renderer2.push(`<!--[!--><p class="rounded-xl bg-white p-8 text-center text-gray-600 shadow-sm dark:bg-slate-700 dark:text-slate-300">${escape_html(feedback().total === 0 ? "Bisher wurde kein Feedback abgegeben." : "Auf dieser Seite gibt es keine Einträge.")}</p>`);
    }
    $$renderer2.push(`<!--]--> `);
    if (feedback().total > feedback().pageSize || feedback().page > 1) {
      $$renderer2.push(`<!--[0--><nav aria-label="Feedback-Seiten" class="mt-6 flex items-center justify-between gap-4">`);
      if (feedback().page > 1) {
        $$renderer2.push(`<!--[0--><a class="underline"${attr("href", `?page=${feedback().page - 1}`)}>← Vorherige Seite</a>`);
      } else {
        $$renderer2.push(`<!--[-1--><span></span>`);
      }
      $$renderer2.push(`<!--]--> <p class="text-gray-600 dark:text-slate-300">Seite ${escape_html(feedback().page)} von ${escape_html(pages())}</p> `);
      if (feedback().page < pages()) {
        $$renderer2.push(`<!--[0--><a class="underline"${attr("href", `?page=${feedback().page + 1}`)}>Nächste Seite →</a>`);
      } else {
        $$renderer2.push(`<!--[-1--><span></span>`);
      }
      $$renderer2.push(`<!--]--></nav>`);
    } else {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}

export { _page_settings as default };
//# sourceMappingURL=_page@settings.svelte-BJ8EcXzZ.js.map
