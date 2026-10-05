import { o as attr, f as escape_html, i as store_get, j as ensure_array_like, c as attr_class, y as bind_props, u as unsubscribe_stores } from './index.js-ppjCynu5.js';
import { p as page } from './stores-DnfpLs7l.js';
import { m as ms } from './index-CjTFt12i.js';
import './state.svelte-v-YuhmC3.js';
import './marked.esm-DcwJ8j7Z.js';

function AiSupportSettings($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { settings = void 0, guildId } = $$props;
    let loading = false;
    let checking = false;
    $$renderer2.push(`<section class="rounded-lg border border-gray-300 p-4 dark:border-slate-600"><h2 class="mb-3 font-semibold">KI-Erstsupport mit Gemini</h2> <a class="mb-3 inline-block text-sm text-orange-600 hover:underline dark:text-orange-400"${attr("href", "/settings/" + guildId + "/faq")}>FAQ aus Tickets prüfen und verwalten</a> <label class="flex items-center gap-3"><input type="checkbox" class="form-checkbox"${attr("checked", settings.aiSupportEnabled, true)}/> <span>Neue Tickets zuerst von der KI beantworten lassen</span></label> <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Kostenloser Zugang → begrenztes Abo-Guthaben → menschlicher Support. Höchstens drei KI-Antworten pro Ticket. Sobald ein Supporter antwortet oder das Ticket übernimmt, endet die KI-Hilfe. Bestehende Tickets bleiben beim Team.</p> <label class="mt-4 block font-medium" for="ai-server-knowledge">FAQ und Regeln für den Support</label> <textarea id="ai-server-knowledge" class="input form-textarea mt-2 min-h-48 font-normal" maxlength="12000" placeholder="Trage hier bekannte Fragen, Antworten, Regeln und hilfreiche Links ein.">`);
    const $$body = escape_html(settings.aiKnowledge);
    if ($$body) {
      $$renderer2.push(`${$$body}`);
    }
    $$renderer2.push(`</textarea> <p class="mt-1 text-sm text-gray-500 dark:text-slate-400">Eigene Kategorie-Texte ersetzen dieses Wissen. Zusätzlich nutzt der Bot passende freigegebene FAQ-Einträge. An Google gehen nur die aktuelle Frage und das passende Wissen, kein Chatverlauf. Dateien werden nicht von der KI gelesen.</p> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <button type="button" class="mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400"${attr("disabled", loading, true)}>${escape_html("Status aktualisieren")}</button> <button type="button" class="ml-4 mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400"${attr("disabled", checking, true)}>${escape_html("Verbindung prüfen")}</button> <button type="button" class="ml-4 mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400"${attr("disabled", checking, true)}>Kostenlose Testantwort prüfen</button> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> `);
    {
      $$renderer2.push("<!--[-1-->");
    }
    $$renderer2.push(`<!--]--> <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">„Kostenlose Testantwort prüfen“ testet das Erzeugen einer Antwort mit einer kurzen vorgegebenen Frage. Dafür werden wenige Tokens des kostenlosen Kontingents verwendet.</p> <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Einrichtung: zwei separate Google-Projekte und eine private Konfigurationsdatei auf dem Botserver. Das Abo enthält 10 US-Dollar, nicht 10 Euro. Die Standardgrenze beträgt 9,50 US-Dollar mit Reserve. Diese Anzeige ist kein Live-Guthabenstand von Google. Den bezahlten Zugang nur mit eingelöstem Guthaben und einem ausschließlich für diesen Bot verwendeten Projekt aktivieren.</p></section>`);
    bind_props($$props, { settings });
  });
}
function _page($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let { data } = $$props;
    let tmp = data, settings = tmp.settings, channels = tmp.channels, locales = tmp.locales, roles = tmp.roles;
    const discordCategories = channels.filter((c) => c.type === 4);
    channels = channels.filter((c) => c.type === 0);
    roles = roles.filter((r) => r.name !== "@everyone").sort((a, b) => b.rawPosition - a.rawPosition);
    roles.forEach((r) => {
      r._hexColor = r.color > 0 ? `#${r.color.toString(16).padStart(6, "0")}` : null;
      r._style = r._hexColor ? `color: ${r._hexColor}` : "";
    });
    settings.autoClose = settings.autoClose ? ms(settings.autoClose) : "";
    settings.logChannel = settings.logChannel ?? "";
    settings.transcriptChannel = settings.transcriptChannel ?? "";
    settings.ticketOverviewChannel = settings.ticketOverviewChannel ?? "";
    settings.closedTicketCategory = settings.closedTicketCategory ?? "";
    settings.automaticTicketStatus = settings.automaticTicketStatus ?? true;
    settings.aiSupportEnabled = settings.aiSupportEnabled ?? false;
    settings.aiKnowledge = settings.aiKnowledge ?? "";
    settings.staleAfter = settings.staleAfter ? ms(settings.staleAfter) : "";
    settings.workingHours = settings.workingHours.map((v) => v === null ? [] : v);
    let autoTag = Array.isArray(settings.autoTag) ? "custom" : settings.autoTag;
    let loading = false;
    let driveLoading = false;
    let $$settled = true;
    let $$inner_renderer;
    function $$render_inner($$renderer3) {
      $$renderer3.push(`<h1 class="m-4 text-center text-4xl font-bold">General settings</h1> <div class="m-2 mx-auto max-w-lg p-4 text-lg">`);
      {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> <section class="mb-8 rounded-lg border border-gray-300 p-4 dark:border-slate-600"><h2 class="mb-3 font-semibold">Google-Drive-Archiv</h2> <label class="flex items-center gap-3"><input type="checkbox" class="form-checkbox"${attr("checked", settings.driveArchiveEnabled, true)}/> <span>HTML und Anhänge privat in Google Drive sichern</span></label> <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">ZIP herunterladen, entpacken und transcript.html öffnen. Die Dateien werden 90 Tage nach Ticketabschluss gelöscht. Nur du hast direkten Drive-Zugriff.</p> `);
      {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> `);
      {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> <button type="button" class="mt-3 text-sm text-orange-600 hover:underline dark:text-orange-400"${attr("disabled", driveLoading, true)}>${escape_html("Status aktualisieren")}</button> <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Einmalige Verbindung mit dem mitgelieferten Einrichtungsprogramm. Nachrichtenarchivierung muss aktiviert sein.</p></section> <div class="mb-8 text-center text-orange-600 dark:text-orange-400"><p class="font-semibold"><i class="fa-solid fa-triangle-exclamation"></i> Warning</p> <p>This page is made to be "just about functional". <a href="https://discordtickets.app/configuration/general" class="font-semibold hover:underline">Read the documentation</a> to avoid breaking something.</p></div> <form><div class="my-4 grid grid-cols-1 gap-8">`);
      AiSupportSettings($$renderer3, {
        guildId: store_get($$store_subs ??= {}, "$page", page).params.guild,
        get settings() {
          return settings;
        },
        set settings($$value) {
          settings = $$value;
          $$settled = false;
        }
      });
      $$renderer3.push(`<!----> <div><label class="font-medium">Auto close after <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="How long should the bot wait before closing (for close command and stale tickets)?"></i> <input type="text" class="input form-input"${attr("value", settings.autoClose)}/></label></div> <div><label class="font-medium">Auto tag channels <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Which channels should the bot respond with tags in?"></i> `);
      $$renderer3.select(
        {
          class: "input form-multiselect block font-normal",
          value: autoTag
        },
        ($$renderer4) => {
          $$renderer4.option({ value: "custom" }, ($$renderer5) => {
            $$renderer5.push(`Specific channels`);
          });
          $$renderer4.option({ value: "ticket" }, ($$renderer5) => {
            $$renderer5.push(`Only ticket channels`);
          });
          $$renderer4.option({ value: "!ticket" }, ($$renderer5) => {
            $$renderer5.push(`All non-ticket channels`);
          });
          $$renderer4.option({ value: "all" }, ($$renderer5) => {
            $$renderer5.push(`All channels`);
          });
        }
      );
      $$renderer3.push(` `);
      if (autoTag === "custom") {
        $$renderer3.push("<!--[0-->");
        $$renderer3.select(
          {
            multiple: true,
            class: "input form-multiselect font-normal",
            value: settings.autoTag
          },
          ($$renderer4) => {
            $$renderer4.push(`<!--[-->`);
            const each_array_2 = ensure_array_like(channels);
            for (let $$index_2 = 0, $$length = each_array_2.length; $$index_2 < $$length; $$index_2++) {
              let channel = each_array_2[$$index_2];
              $$renderer4.option({ value: channel.id, class: "m-1 rounded p-1" }, ($$renderer5) => {
                $$renderer5.push(`${escape_html(channel.name)}`);
              });
            }
            $$renderer4.push(`<!--]-->`);
          }
        );
      } else {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--></label></div> <div><label for="archive" class="font-medium">Archive <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Save messages sent in tickets for future use?"></i> <input type="checkbox" id="archive" name="archive" class="form-checkbox"${attr("checked", settings.archive, true)}/></label></div> <div><label class="font-medium">Blocklist <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Which roles should the bot ignore?"></i> `);
      $$renderer3.select(
        {
          multiple: true,
          class: "input form-multiselect h-44 font-normal",
          value: settings.blocklist
        },
        ($$renderer4) => {
          $$renderer4.push(`<!--[-->`);
          const each_array_3 = ensure_array_like(roles);
          for (let $$index_3 = 0, $$length = each_array_3.length; $$index_3 < $$length; $$index_3++) {
            let role = each_array_3[$$index_3];
            $$renderer4.option({ value: role.id, class: "m-1 rounded p-1", style: role._style }, ($$renderer5) => {
              $$renderer5.push(`${escape_html(role.unicodeEmoji || "")}
								${escape_html(role.name)}`);
            });
          }
          $$renderer4.push(`<!--]-->`);
        }
      );
      $$renderer3.push(`</label></div> <div><div class="font-medium">Buttons <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Which buttons should be enabled (if the feature is enabled in the category)?"></i> <div class="mx-4"><div><label for="claimButton" class="text-base font-medium">Claim <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Add a claim/unclaim button to the opening message (if enabled in category)?"></i> <input type="checkbox" id="claimButton" name="claimButton" class="form-checkbox"${attr("checked", settings.claimButton, true)}/></label></div> <div><label for="closeButton" class="text-base font-medium">Close <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Add a close button to the opening message?"></i> <input type="checkbox" id="closeButton" name="closeButton" class="form-checkbox"${attr("checked", settings.closeButton, true)}/></label></div></div></div></div> <div><label class="font-medium">Error colour <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="What colour should error embeds be?"></i> <input type="text" class="input form-input"${attr("value", settings.errorColour)}/></label></div> <div><label class="font-medium">Footer <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="What text should be at the bottom of embeds?"></i> <input type="text" class="input form-input"${attr("value", settings.footer)}/></label></div> <div><label class="font-medium">Locale <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Which language should the bot respond in?"></i> `);
      $$renderer3.select({ class: "input form-multiselect", value: settings.locale }, ($$renderer4) => {
        $$renderer4.push(`<!--[-->`);
        const each_array_4 = ensure_array_like(locales);
        for (let $$index_4 = 0, $$length = each_array_4.length; $$index_4 < $$length; $$index_4++) {
          let locale = each_array_4[$$index_4];
          $$renderer4.option({ value: locale, class: "p-1" }, ($$renderer5) => {
            $$renderer5.push(`${escape_html(locale)}`);
          });
        }
        $$renderer4.push(`<!--]-->`);
      });
      $$renderer3.push(`</label></div> <div><label class="font-medium">Log channel <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="Which channel should logs be sent to?"></i> `);
      $$renderer3.select(
        { class: "input form-multiselect", value: settings.logChannel },
        ($$renderer4) => {
          $$renderer4.option({ value: "" }, ($$renderer5) => {
            $$renderer5.push(`None`);
          });
          $$renderer4.push(`<hr/><!--[-->`);
          const each_array_5 = ensure_array_like(channels);
          for (let $$index_5 = 0, $$length = each_array_5.length; $$index_5 < $$length; $$index_5++) {
            let channel = each_array_5[$$index_5];
            $$renderer4.option({ value: channel.id, class: "p-1" }, ($$renderer5) => {
              $$renderer5.push(`${escape_html(channel.name)}`);
            });
          }
          $$renderer4.push(`<!--]-->`);
        },
        void 0,
        void 0,
        void 0,
        void 0,
        true
      );
      $$renderer3.push(`</label></div> <div><label for="transcript-channel" class="font-medium">Transkript-Kanal</label> `);
      $$renderer3.select(
        {
          id: "transcript-channel",
          class: "input form-select block font-normal",
          value: settings.transcriptChannel
        },
        ($$renderer4) => {
          $$renderer4.option({ value: "" }, ($$renderer5) => {
            $$renderer5.push(`Keine automatische Ablage`);
          });
          $$renderer4.push(`<!--[-->`);
          const each_array_6 = ensure_array_like(channels);
          for (let $$index_6 = 0, $$length = each_array_6.length; $$index_6 < $$length; $$index_6++) {
            let channel = each_array_6[$$index_6];
            $$renderer4.option({ value: channel.id }, ($$renderer5) => {
              $$renderer5.push(`#${escape_html(channel.name)}`);
            });
          }
          $$renderer4.push(`<!--]-->`);
        }
      );
      $$renderer3.push(` <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Hier werden Transkript-Dateien und Abschlussübersichten abgelegt. Wähle einen anderen Kanal als den Log-Kanal. Die Nachrichtenarchivierung muss aktiviert sein.</p></div> <div><label for="ticket-overview-channel" class="font-medium">Ticket-Übersichtskanal</label> `);
      $$renderer3.select(
        {
          id: "ticket-overview-channel",
          class: "input form-select block font-normal",
          value: settings.ticketOverviewChannel
        },
        ($$renderer4) => {
          $$renderer4.option({ value: "" }, ($$renderer5) => {
            $$renderer5.push(`Keine Ticket-Übersicht`);
          });
          $$renderer4.push(`<!--[-->`);
          const each_array_7 = ensure_array_like(channels);
          for (let $$index_7 = 0, $$length = each_array_7.length; $$index_7 < $$length; $$index_7++) {
            let channel = each_array_7[$$index_7];
            $$renderer4.option({ value: channel.id }, ($$renderer5) => {
              $$renderer5.push(`#${escape_html(channel.name)}`);
            });
          }
          $$renderer4.push(`<!--]-->`);
        }
      );
      $$renderer3.push(` <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Ein interner Kanal für beide Support-Kategorien. Pro offenem Ticket gibt es einen Eintrag, der beim Schließen gelöscht wird. Wähle einen anderen Kanal als Log und Transkript.</p></div> <div><label for="closed-ticket-category" class="font-medium">Kategorie für geschlossene Tickets</label> `);
      $$renderer3.select(
        {
          id: "closed-ticket-category",
          class: "input form-select block font-normal",
          value: settings.closedTicketCategory
        },
        ($$renderer4) => {
          $$renderer4.option({ value: "" }, ($$renderer5) => {
            $$renderer5.push(`In bisheriger Kategorie behalten`);
          });
          $$renderer4.push(`<!--[-->`);
          const each_array_8 = ensure_array_like(discordCategories);
          for (let $$index_8 = 0, $$length = each_array_8.length; $$index_8 < $$length; $$index_8++) {
            let category = each_array_8[$$index_8];
            $$renderer4.option({ value: category.id }, ($$renderer5) => {
              $$renderer5.push(`${escape_html(category.name)}`);
            });
          }
          $$renderer4.push(`<!--]-->`);
        }
      );
      $$renderer3.push(` <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Beim Schließen wird der Kanal in diese Discord-Kategorie verschoben und mit seiner Ticketnummer umbenannt, zum Beispiel closed-27. Die bisherigen Ticketrechte bleiben erhalten. Das Team kann bis „Delete“ weiterarbeiten.</p></div> <div><label for="automatic-ticket-status" class="flex items-center gap-2 font-medium"><input id="automatic-ticket-status" type="checkbox" class="form-checkbox"${attr("checked", settings.automaticTicketStatus, true)}/>Automatischer Antwortstatus</label> <p class="mt-2 text-sm text-gray-500 dark:text-slate-400">Nach fünf Minuten ohne Rückmeldung: 🛠️ wartet auf Support, 👤 wartet auf Nutzer. Das Prioritäts-Emoji bleibt daneben erhalten. Jede neue Antwort startet die Wartezeit erneut.</p></div> <div><label class="font-medium">Primary colour <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="What colour should normal embeds be?"></i> <input type="text" class="input form-input"${attr("value", settings.primaryColour)}/></label></div> <div><label class="font-medium">Stale after <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="When should the bot remind members/staff about messages with no reply?"></i> <input type="text" class="input form-input"${attr("value", settings.staleAfter)}/></label></div> <div><label class="font-medium">Success colour <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="What colour should success embeds be?"></i> <input type="text" class="input form-input"${attr("value", settings.successColour)}/></label></div> <div><div class="grid grid-cols-1 gap-2 font-medium"><div>Working hours <i class="fa-solid fa-circle-question cursor-help text-gray-500 dark:text-slate-400" title="When can your members expect staff to be available?"></i> <p class="cursor-pointer select-none text-gray-500 transition duration-300 hover:text-blurple dark:text-slate-400 dark:hover:text-blurple"><i${attr_class(`fa-solid ${"fa-angle-down"} float-right text-xl`)}></i> <span class="text-sm">Click to ${escape_html("expand")}</span></p></div> `);
      {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--></div></div></div> <button type="submit"${attr("disabled", loading, true)} class="float-right mt-4 rounded-lg bg-green-300 p-2 px-5 font-medium transition duration-300 hover:bg-green-500 hover:text-white disabled:cursor-not-allowed dark:bg-green-500/50 dark:hover:bg-green-500 dark:hover:text-white">`);
      {
        $$renderer3.push("<!--[-1-->");
      }
      $$renderer3.push(`<!--]--> Submit</button></form></div>`);
    }
    do {
      $$settled = true;
      $$inner_renderer = $$renderer2.copy();
      $$render_inner($$inner_renderer);
    } while (!$$settled);
    $$renderer2.subsume($$inner_renderer);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}

export { _page as default };
//# sourceMappingURL=_page.svelte-CkJON6mI.js.map
