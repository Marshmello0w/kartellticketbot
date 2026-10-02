import { e as error } from './index.js-KfzjwGgO.js';

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
const component = async () => component_cache ??= (await import('./_page.svelte-BloVbgxD.js')).default;
const universal_id = "src/routes/settings/[guild]/texts/+page.js";
const imports = ["_app/immutable/nodes/25.BVPPwrKh.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DwwE2jqI.js","_app/immutable/chunks/DE5Iowad.js","_app/immutable/chunks/DP8wplhw.js","_app/immutable/chunks/DFjlfogR.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/BBpVbx05.js","_app/immutable/chunks/BYjY2uw9.js","_app/immutable/chunks/CaGsRYWH.js","_app/immutable/chunks/Cp-6fQLy.js","_app/immutable/chunks/OpoNnSCY.js","_app/immutable/chunks/D5e7f_xL.js","_app/immutable/chunks/UuB358WI.js","_app/immutable/chunks/Bvo78435.js","_app/immutable/chunks/CoaZrW8W.js","_app/immutable/chunks/3-AIV4l0.js","_app/immutable/chunks/BbBYT-As.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=25-Cj7Bivai.js.map
