import { e as error } from './index.js-2RGYJ5Uy.js';

async function load({ fetch, params }) {
  const response = await fetch(`/api/admin/guilds/${params.guild}/tags`);
  const isJSON = response.headers.get("Content-Type")?.includes("json");
  const body = isJSON ? await response.json() : await response.text();
  if (!response.ok) {
    error(response.status, isJSON ? JSON.stringify(body) : body);
  } else {
    return {
      tags: body
    };
  }
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 24;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-BxKh8ehe.js')).default;
const universal_id = "src/routes/settings/[guild]/tags/+page.js";
const imports = ["_app/immutable/nodes/24.C_rHXr2D.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/Dv2nvox1.js","_app/immutable/chunks/BDD76Zze.js","_app/immutable/chunks/nbOe66zO.js","_app/immutable/chunks/03FJNrH_.js","_app/immutable/chunks/BZ_rmVnY.js","_app/immutable/chunks/prLBtmkN.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/CqQXGPHb.js","_app/immutable/chunks/CQX1XZF1.js","_app/immutable/chunks/69_IOA4Y.js","_app/immutable/chunks/CJ2jmA2a.js","_app/immutable/chunks/4RCHW5yo.js","_app/immutable/chunks/-ELKrdk7.js","_app/immutable/chunks/B_dbunaP.js","_app/immutable/chunks/67W2KX7y.js","_app/immutable/chunks/B6Ea0jkt.js","_app/immutable/chunks/Byl_D19b.js","_app/immutable/chunks/BIW6MolB.js"];
const stylesheets = ["_app/immutable/assets/24.DYPRwk0y.css"];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=24-CVNyuXRV.js.map
