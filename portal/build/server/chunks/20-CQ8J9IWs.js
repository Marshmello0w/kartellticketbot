import { e as error } from './index.js-COx5E4B1.js';

async function load({ fetch, params }) {
  const url = `/api/admin/guilds/${params.guild}/categories/${params.category}/texts`;
  const response = await fetch(url, { credentials: "include" });
  const body = await response.json();
  if (!response.ok) error(response.status, body.message || "Texte konnten nicht geladen werden.");
  return { ...body, url };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 20;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-fmE_Ulgk.js')).default;
const universal_id = "src/routes/settings/[guild]/categories/[category]/texts/+page.js";
const imports = ["_app/immutable/nodes/20.C3h01Kke.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/zAUzxfX4.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/Dl8uzYM-.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/e5LSwPZ8.js","_app/immutable/chunks/CJ2jmA2a.js","_app/immutable/chunks/nbOe66zO.js","_app/immutable/chunks/03FJNrH_.js","_app/immutable/chunks/Bf6Eorkm.js","_app/immutable/chunks/B0-Gg5hR.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=20-CQ8J9IWs.js.map
