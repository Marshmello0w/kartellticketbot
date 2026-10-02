import { r as redirect, e as error } from './index.js-KfzjwGgO.js';

async function load({ fetch, params, url }) {
  const response = await fetch(`/api/admin/guilds/${params.guild}`);
  const isJSON = response.headers.get("Content-Type")?.includes("json");
  const body = isJSON ? await response.json() : await response.text();
  if (response.status === 401 && body.elevate) {
    redirect(307, `/auth/login?r=${encodeURIComponent(url.pathname + url.search)}&role=${body.elevate}`);
  } else if (!response.ok) {
    error(response.status, isJSON ? JSON.stringify(body) : body);
  } else {
    return { guild: body };
  }
}

var _layout = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 7;
let component_cache;
const component = async () => component_cache ??= (await import('./_layout.svelte-CR_Wnx5D.js')).default;
const universal_id = "src/routes/settings/[guild]/+layout.js";
const imports = ["_app/immutable/nodes/7.D0WCWta1.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/BQGvbjzL.js","_app/immutable/chunks/DE5Iowad.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _layout as universal, universal_id };
//# sourceMappingURL=7-CdJ34JU-.js.map
