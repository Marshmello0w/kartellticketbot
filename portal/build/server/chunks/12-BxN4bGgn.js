import { _ as __variableDynamicImportRuntimeHelper } from './dynamic-import-helper-uMTE3ehW.js';
import { i as importJSON } from './i18n-ue4QmWvy.js';

async function load({ parent }) {
  const { locale } = await parent();
  return {
    translations: importJSON(await __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "../../../lib/locales/en-GB/_common.json": () => import('./_common-BCxAG6Xd.js') }), `../../../lib/locales/${locale}/_common.json`, 7))
  };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 12;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-5C75zEr8.js')).default;
const universal_id = "src/routes/(default)/[guild]/+page.js";
const imports = ["_app/immutable/nodes/12.BpEDF4ss.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/DS7_lcac.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/BBpVbx05.js","_app/immutable/chunks/DE5Iowad.js","_app/immutable/chunks/bBXygXka.js","_app/immutable/chunks/CaGsRYWH.js","_app/immutable/chunks/Cp-6fQLy.js","_app/immutable/chunks/OpoNnSCY.js","_app/immutable/chunks/Bvo78435.js","_app/immutable/chunks/CoaZrW8W.js","_app/immutable/chunks/BEL6sIsv.js","_app/immutable/chunks/3-AIV4l0.js","_app/immutable/chunks/DFjlfogR.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/BbBYT-As.js","_app/immutable/chunks/B0XwC4Ot.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=12-BxN4bGgn.js.map
