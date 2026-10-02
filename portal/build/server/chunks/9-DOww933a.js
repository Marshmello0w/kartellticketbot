import { r as redirect } from './index.js-C0SVnIjX.js';

async function load({ url }) {
  redirect(307, `/auth/login?invite&guild=${url.searchParams.get("guild") || ""}`);
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 9;
const universal_id = "src/routes/(default)/invite/+page.js";
const imports = ["_app/immutable/nodes/9.cp3OJKD9.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js"];
const stylesheets = [];
const fonts = [];

export { fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=9-DOww933a.js.map
