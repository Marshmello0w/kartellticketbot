import { e as error } from './index.js-KfzjwGgO.js';

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
const component = async () => component_cache ??= (await import('./_page.svelte-CGajZCVk.js')).default;
const universal_id = "src/routes/settings/[guild]/categories/+page.js";
const imports = ["_app/immutable/nodes/18.qR_AkGDd.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/BBpVbx05.js","_app/immutable/chunks/DE5Iowad.js","_app/immutable/chunks/BYjY2uw9.js","_app/immutable/chunks/CaGsRYWH.js","_app/immutable/chunks/Cp-6fQLy.js","_app/immutable/chunks/OpoNnSCY.js","_app/immutable/chunks/DSwvs_u7.js","_app/immutable/chunks/Cpj98o6Y.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=18-DJ01zhPq.js.map
