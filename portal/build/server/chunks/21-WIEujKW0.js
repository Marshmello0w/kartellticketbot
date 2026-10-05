import { e as error } from './index.js-DoVJ5_vR.js';

async function load({ fetch, params, url }) {
  const api = "/api/admin/guilds/" + params.guild + "/faq";
  const query = new URLSearchParams({ status: url.searchParams.get("status") || "draft", page: url.searchParams.get("page") || "1", query: url.searchParams.get("query") || "" });
  const response = await fetch(api + "?" + query.toString(), { credentials: "include" });
  const body = await response.json();
  if (!response.ok) error(response.status, body.message || "FAQ konnten nicht geladen werden.");
  return { ...body, api, guildId: params.guild, status: query.get("status"), search: query.get("query") };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 21;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-zgrVzknr.js')).default;
const universal_id = "src/routes/settings/[guild]/faq/+page.js";
const imports = ["_app/immutable/nodes/21.C_S_L_NY.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/e5LSwPZ8.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=21-WIEujKW0.js.map
