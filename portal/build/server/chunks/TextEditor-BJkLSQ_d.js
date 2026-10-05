import { f as escape_html, o as attr, j as ensure_array_like, p as derived } from './index.js-ppjCynu5.js';
import './state.svelte-v-YuhmC3.js';

function TextEditor($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data } = $$props;
    let overrides = JSON.parse(JSON.stringify(data.overrides));
    let search = "";
    let group = "";
    const names = {
      buttons: "Buttons",
      text: "Beschriftung",
      close: "Schließen",
      accept_close_request: "Schließung akzeptieren",
      reject_close_request: "Schließung ablehnen",
      claim: "Übernehmen",
      unclaim: "Freigeben",
      edit: "Bearbeiten",
      create: "Ticket erstellen",
      cancel: "Abbrechen",
      transcript: "Transkript",
      confirm_open: "Ticket bestätigen",
      ticket: "Ticket",
      dm: "Direktnachricht",
      modals: "Formular",
      menus: "Auswahl",
      misc: "Hinweis",
      commands: "Command",
      slash: "",
      message: "",
      user: "",
      title: "Überschrift",
      description: "Nachricht",
      fields: "",
      name: "Bezeichnung",
      value: "Inhalt",
      label: "Beschriftung",
      placeholder: "Eingabehinweis",
      staff_request: "Anfrage des Teams",
      user_request: "Anfrage des Nutzers",
      closed: "Geschlossen",
      closing_soon: "Baldige Schließung",
      inactive: "Inaktivität",
      feedback: "Feedback",
      rating: "Bewertung",
      comment: "Kommentar",
      created: "Erstellt",
      offline: "Team offline",
      working_hours: "Supportzeiten",
      forbidden: "Keine Berechtigung",
      not_staff: "Kein Teammitglied",
      success: "Bestätigung",
      wait_for_user: "Auf Nutzer warten",
      wait_for_staff: "Auf Team warten",
      rejected: "Abgelehnt",
      topic: "Thema",
      answers: "Antworten",
      opening_message: "Begrüßung",
      released: "Freigegeben",
      claimed: "Übernommen",
      response: "Antwort",
      no_value: "Kein Inhalt",
      edited: "Bearbeitet",
      references_message: "Nachrichtenverweis",
      references_ticket: "Ticketverweis"
    };
    const supportNames = {
      support: "Support-Aktionen",
      open_ticket: "Ticket öffnen",
      support_previous: "Vorherige Seite",
      support_next: "Nächste Seite",
      options: "Aktionen",
      actions: "Menüüberschrift",
      saved: "Bestätigung",
      deadline: "Schließfrist",
      status: "Antwortstatus",
      active: "Aktiv",
      staff: "Wartet auf Support",
      overview: "Ticket-Übersicht",
      creator: "Ersteller",
      assigned: "Zuständiger Supporter",
      unassigned: "Ohne Supporter",
      no_priority: "Ohne Priorität",
      priority: "Priorität",
      activity: "Letzte Aktivität",
      release: "Freigeben",
      handoff: "Supporter-Übergabe",
      move: "Kategorie wechseln",
      errors: "Fehlermeldungen",
      target: "Ungültiger Supporter",
      changed: "Ticket inzwischen geändert",
      invalid: "Ungültige Auswahl",
      category: "Zielkategorie",
      full: "Kategorie voll",
      failed: "Aktion fehlgeschlagen"
    };
    const label = (key) => key.split(".").map((part) => key.startsWith("ticket.support.") && part === "user" ? "Wartet auf Nutzer" : supportNames[part] ?? names[part] ?? part.replaceAll("_", " ")).filter(Boolean).join(" · ");
    const inherited = (field) => data.inherited[field.key] ?? field.defaultValue;
    const value = (field) => overrides[field.key] ?? inherited(field);
    const groups = [...new Set(data.catalog.map((field) => field.group))];
    let fields = derived(() => data.catalog.filter((field) => `${label(field.key)} ${field.key} ${JSON.stringify(value(field))}`.toLowerCase().includes(search.toLowerCase())));
    function preview(text) {
      return text.replace(/\{\{?\s*([\w.:-]+)\s*\}\}?/g, (_, name) => ({
        user: "@Nutzer",
        requestedBy: "@Team",
        channel: "#ticket-42",
        number: "42",
        category: "English",
        absolute: "Freitag, 2. Oktober 2026, 20:00",
        relative: "in 12 Stunden",
        timestamp: "1790935200",
        time: "12 Stunden",
        command: "/new",
        url: "https://example.com/settings"
      })[name] || `[${name}]`).replace(/%d/g, "2").replace(/%s/g, "Beispiel");
    }
    $$renderer2.push(`<div class="mx-auto max-w-4xl px-4 pb-12"><h1 class="mb-3 text-3xl font-bold">${escape_html(data.categoryName ? `Texte für ${data.categoryName}` : "Supporttexte für den Server")}</h1> <p class="mb-6 text-gray-600 dark:text-slate-300">${escape_html(data.categoryName ? "Schreibe hier die Texte für diese Kategorie. Nicht angepasste Felder übernehmen die Servertexte." : "Diese Texte gelten für alle Kategorien, die keine eigenen Texte hinterlegt haben.")} Änderungen gelten für neue Nachrichten; bestehende Buttons bleiben unverändert.</p> <div class="sticky top-0 z-10 mb-6 rounded-xl bg-gray-100 p-4 shadow-sm dark:bg-slate-800"><div class="flex flex-wrap items-end gap-4"><label class="grow">Text suchen<input class="input form-input block" type="search"${attr("value", search)} placeholder="Zum Beispiel Schließen oder Feedback"/></label> <label>Bereich`);
    $$renderer2.select({ class: "input form-select block", value: group }, ($$renderer3) => {
      $$renderer3.option({ value: "" }, ($$renderer4) => {
        $$renderer4.push(`Alle Bereiche`);
      });
      $$renderer3.push(`<!--[-->`);
      const each_array = ensure_array_like(groups);
      for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
        let item = each_array[$$index];
        $$renderer3.option({}, item);
      }
      $$renderer3.push(`<!--]-->`);
    });
    $$renderer2.push(`</label> <button class="rounded-lg bg-blurple px-5 py-2 font-semibold text-white disabled:opacity-50" type="button"${attr("disabled", true, true)}>${escape_html("Texte speichern")}</button></div> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--></div> `);
    const each_array_1 = ensure_array_like(fields());
    if (each_array_1.length !== 0) {
      $$renderer2.push("<!--[-->");
      for (let $$index_2 = 0, $$length = each_array_1.length; $$index_2 < $$length; $$index_2++) {
        let field = each_array_1[$$index_2];
        $$renderer2.push(`<section class="mb-5 rounded-xl bg-white p-5 shadow-sm dark:bg-slate-700"><div class="mb-3 flex flex-wrap items-start justify-between gap-2"><div><h2 class="font-semibold">${escape_html(label(field.key))}</h2><p class="text-sm text-gray-500 dark:text-slate-400">${escape_html(field.group)} · ${escape_html(Object.hasOwn(overrides, field.key) ? "Eigener Text" : data.inherited[field.key] !== void 0 ? "Servertext" : "Standardtext")}</p></div> <button type="button" class="text-sm underline disabled:opacity-40"${attr("disabled", !Object.hasOwn(overrides, field.key), true)}>Auf Standard zurücksetzen</button></div> <!--[-->`);
        const each_array_2 = ensure_array_like(Array.isArray(value(field)) ? value(field) : [value(field)]);
        for (let index = 0, $$length2 = each_array_2.length; index < $$length2; index++) {
          let text = each_array_2[index];
          $$renderer2.push(`<label class="block">`);
          if (Array.isArray(value(field))) {
            $$renderer2.push(`<!--[0--><span class="text-sm">${escape_html(value(field).length === 3 ? ["Keine", "Einzahl", "Mehrzahl"][index] : ["Einzahl", "Mehrzahl"][index])}</span>`);
          } else {
            $$renderer2.push("<!--[-1-->");
          }
          $$renderer2.push(`<!--]--> <textarea class="input form-textarea block min-h-20 w-full"${attr("rows", text.includes("\n") ? 5 : 2)}${attr("maxlength", field.maxLength)}${attr("aria-label", label(field.key) + (Array.isArray(value(field)) ? ` Variante ${index + 1}` : ""))}>`);
          const $$body = escape_html(text);
          if ($$body) {
            $$renderer2.push(`${$$body}`);
          }
          $$renderer2.push(`</textarea></label> <p class="mt-1 text-right text-xs text-gray-500 dark:text-slate-400">${escape_html(text.length)} / ${escape_html(field.maxLength)} Zeichen</p> <details class="mb-2 text-sm"><summary class="cursor-pointer text-gray-600 dark:text-slate-300">Vorschau mit Beispieldaten</summary><div class="mt-2 whitespace-pre-wrap rounded-lg bg-gray-100 p-3 dark:bg-slate-800">${escape_html(preview(text))}</div></details>`);
        }
        $$renderer2.push(`<!--]--> `);
        if (field.placeholders.length) {
          $$renderer2.push(`<!--[0--><p class="text-sm text-gray-500 dark:text-slate-400">Verfügbare Platzhalter: ${escape_html(field.placeholders.join(", "))}</p>`);
        } else {
          $$renderer2.push("<!--[-1-->");
        }
        $$renderer2.push(`<!--]--></section>`);
      }
    } else {
      $$renderer2.push(`<!--[!--><p class="py-8 text-center">Keine passenden Texte gefunden.</p>`);
    }
    $$renderer2.push(`<!--]--></div>`);
  });
}

export { TextEditor as T };
//# sourceMappingURL=TextEditor-BJkLSQ_d.js.map
