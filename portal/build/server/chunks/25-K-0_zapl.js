import { e as error } from './index.js-ppjCynu5.js';

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

const index = 25;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-BvYJOzq_.js')).default;
const universal_id = "src/routes/settings/[guild]/tags/+page.js";
const imports = ["_app/immutable/nodes/25.HCPTHMho.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/e5LSwPZ8.js","_app/immutable/chunks/BDD76Zze.js","_app/immutable/chunks/nbOe66zO.js","_app/immutable/chunks/03FJNrH_.js","_app/immutable/chunks/B3NuF3gG.js","_app/immutable/chunks/Dw9UU9sf.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/CNpN20RP.js","_app/immutable/chunks/CQX1XZF1.js","_app/immutable/chunks/69_IOA4Y.js","_app/immutable/chunks/CJ2jmA2a.js","_app/immutable/chunks/4RCHW5yo.js","_app/immutable/chunks/-ELKrdk7.js","_app/immutable/chunks/B_dbunaP.js","_app/immutable/chunks/67W2KX7y.js","_app/immutable/chunks/B6Ea0jkt.js","_app/immutable/chunks/D7lO7nIc.js","_app/immutable/chunks/BIW6MolB.js"];
const stylesheets = ["_app/immutable/assets/25.DYPRwk0y.css"];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=25-K-0_zapl.js.map
