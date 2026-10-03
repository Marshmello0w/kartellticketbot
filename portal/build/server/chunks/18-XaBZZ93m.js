import { e as error } from './index.js-COx5E4B1.js';

async function load({ fetch, params }) {
  const response = await fetch(`/api/admin/guilds/${params.guild}/categories`);
  const isJSON = response.headers.get("Content-Type")?.includes("json");
  const body = isJSON ? await response.json() : await response.text();
  if (!response.ok) {
    error(response.status, isJSON ? JSON.stringify(body) : body);
  } else {
    return { categories: body };
  }
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 18;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-BnhsuW1_.js')).default;
const universal_id = "src/routes/settings/[guild]/categories/+page.js";
const imports = ["_app/immutable/nodes/18.B5A9Qy7L.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/DSwvs_u7.js","_app/immutable/chunks/Cpj98o6Y.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=18-XaBZZ93m.js.map
