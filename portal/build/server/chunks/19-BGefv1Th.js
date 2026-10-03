import { e as error } from './index.js-COx5E4B1.js';

async function load({ fetch, params }) {
  const fetchOptions = { credentials: "include" };
  let body;
  if (params.category === "new") {
    body = {
      aiSupportEnabled: true,
      aiResponseLanguage: "auto",
      aiKnowledge: "",
      channelName: "",
      claiming: false,
      description: "",
      discordCategory: "new",
      enableFeedback: false,
      emoji: "",
      image: "",
      memberLimit: 1,
      name: "",
      openingMessage: "",
      pingRoles: [],
      questions: [],
      ratelimit: null,
      requiredRoles: [],
      requireTopic: false,
      staffRoles: [],
      totalLimit: 50
    };
  } else {
    const response = await fetch(
      `/api/admin/guilds/${params.guild}/categories/${params.category}`,
      fetchOptions
    );
    const isJSON = response.headers.get("Content-Type")?.includes("json");
    body = isJSON ? await response.json() : await response.text();
    if (!response.ok) {
      error(response.status, isJSON ? JSON.stringify(body) : body);
    }
  }
  let url = `/api/admin/guilds/${params.guild}/categories`;
  if (params.category !== "new") url += `/${params.category}`;
  return {
    url,
    category: body,
    channels: await (await fetch(`/api/admin/guilds/${params.guild}/data?query=channels.cache`, fetchOptions)).json(),
    roles: await (await fetch(`/api/admin/guilds/${params.guild}/data?query=roles.cache`, fetchOptions)).json(),
    settings: await (await fetch(`/api/admin/guilds/${params.guild}/settings`, fetchOptions)).json()
  };
}

var _page = /*#__PURE__*/Object.freeze({
  __proto__: null,
  load: load
});

const index = 19;
let component_cache;
const component = async () => component_cache ??= (await import('./_page.svelte-OwovcOi3.js')).default;
const universal_id = "src/routes/settings/[guild]/categories/[category]/+page.js";
const imports = ["_app/immutable/nodes/19.ByIxBcTR.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/zAUzxfX4.js","_app/immutable/chunks/JeaavXod.js","_app/immutable/chunks/-ELKrdk7.js","_app/immutable/chunks/D8nEB7ii.js","_app/immutable/chunks/BBdXh__W.js","_app/immutable/chunks/htgvSusx.js","_app/immutable/chunks/DKOMjlmh.js","_app/immutable/chunks/e5LSwPZ8.js","_app/immutable/chunks/BDD76Zze.js","_app/immutable/chunks/ws1_gvEc.js","_app/immutable/chunks/5EBxWskT.js","_app/immutable/chunks/Cpj98o6Y.js","_app/immutable/chunks/DSwvs_u7.js","_app/immutable/chunks/4RCHW5yo.js","_app/immutable/chunks/CJ2jmA2a.js","_app/immutable/chunks/nbOe66zO.js","_app/immutable/chunks/03FJNrH_.js","_app/immutable/chunks/ZENfGddi.js","_app/immutable/chunks/B1HsTET1.js","_app/immutable/chunks/Bf6Eorkm.js","_app/immutable/chunks/B0-Gg5hR.js","_app/immutable/chunks/CQX1XZF1.js","_app/immutable/chunks/69_IOA4Y.js","_app/immutable/chunks/Bhy9eQb5.js","_app/immutable/chunks/XvGdrWkI.js","_app/immutable/chunks/67W2KX7y.js","_app/immutable/chunks/BIW6MolB.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=19-BGefv1Th.js.map
