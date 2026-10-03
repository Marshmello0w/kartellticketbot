import { e as error } from './index.js-BDOu-5gt.js';

async function load({ fetch, params }) {
  const url = `/api/admin/guilds/${params.guild}/texts`;
  const response = await fetch(url, { credentials: "include" });
  const body = await response.json();
  if (!response.ok) error(response.status, body.message || "Texte konnten nicht geladen werden.");
  return { ...body, url };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 25;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-ByrSa921.js')).default;
const universal_id = "src/routes/settings/[guild]/texts/+page.js";
const imports = ["_app/immutable/nodes/25.1KBOnWRj.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/zAUzxfX4.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/BtQugWIF.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/e5LSwPZ8.js","_app/immutable/chunks/CJ2jmA2a.js","_app/immutable/chunks/nbOe66zO.js","_app/immutable/chunks/03FJNrH_.js","_app/immutable/chunks/CYAwev_e.js","_app/immutable/chunks/JLnxSBli.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=25-CNTwYCcD.js.map
