import { _ as __variableDynamicImportRuntimeHelper } from './dynamic-import-helper-uMTE3ehW.js';
import { r as redirect } from './index.js-ppjCynu5.js';
import { i as importJSON } from './i18n-ue4QmWvy.js';

async function load({ parent, fetch }) {
  redirect(302, "/settings");
  const { locale } = await parent();
  const guilds = await (await fetch(`/api/guilds`)).json();
  if (guilds.length === 0) {
    redirect(302, "/settings");
  } else if (guilds.length === 1) {
    redirect(302, `/${guilds[0].id}`);
  }
  return {
    translations: importJSON(
      await __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "../../lib/locales/en-GB/_common.json": () => import('./_common-BCxAG6Xd.js') }), `../../lib/locales/${locale}/_common.json`, 6),
      await __variableDynamicImportRuntimeHelper(/* @__PURE__ */ Object.assign({ "../../lib/locales/en-GB/misc.json": () => import('./misc-Gf_O-cD6.js') }), `../../lib/locales/${locale}/misc.json`, 6)
    ),
    guilds
  };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 8;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-CFG0wUJG.js')).default;
const universal_id = "src/routes/(default)/+page.js";
const imports = ["_app/immutable/nodes/8.BgqS50Jh.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/DS7_lcac.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/Bi-HsxjC.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=8-DWbQ2cnq.js.map
