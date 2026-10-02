async function load({ fetch }) {
  const fetchOptions = { credentials: "include" };
  return {
    guilds: await (await fetch(`/api/admin/guilds`, fetchOptions)).json()
  };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 16;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-CWep-uRD.js')).default;
const universal_id = "src/routes/settings/+page.js";
const imports = ["_app/immutable/nodes/16.ETOiCZJ9.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/BBpVbx05.js","_app/immutable/chunks/DE5Iowad.js","_app/immutable/chunks/BYjY2uw9.js","_app/immutable/chunks/CaGsRYWH.js","_app/immutable/chunks/Cp-6fQLy.js","_app/immutable/chunks/OpoNnSCY.js","_app/immutable/chunks/BbBYT-As.js","_app/immutable/chunks/DFjlfogR.js","_app/immutable/chunks/CoaZrW8W.js","_app/immutable/chunks/B0XwC4Ot.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=16-BKr_d2pl.js.map
