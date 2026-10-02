import { e as error } from './index.js-KfzjwGgO.js';

async function load({ fetch, params }) {
  const fetchOptions = { credentials: "include" };
  let body;
  if (params.category === "new") {
    body = {
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
const component = async () => component_cache ??= (await import('./_page.svelte-xhVT_AmQ.js')).default;
const universal_id = "src/routes/settings/[guild]/categories/[category]/+page.js";
const imports = ["_app/immutable/nodes/19.C3XUnciz.js","_app/immutable/chunks/Bq-rPRmx.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DFjlfogR.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/BBpVbx05.js","_app/immutable/chunks/DE5Iowad.js","_app/immutable/chunks/DwwE2jqI.js","_app/immutable/chunks/BYjY2uw9.js","_app/immutable/chunks/DU4drHu5.js","_app/immutable/chunks/CaGsRYWH.js","_app/immutable/chunks/Cp-6fQLy.js","_app/immutable/chunks/OpoNnSCY.js","_app/immutable/chunks/_pSPK0TF.js","_app/immutable/chunks/D5e7f_xL.js","_app/immutable/chunks/BDD76Zze.js","_app/immutable/chunks/BAB4lnyF.js","_app/immutable/chunks/5EBxWskT.js","_app/immutable/chunks/Cpj98o6Y.js","_app/immutable/chunks/DSwvs_u7.js","_app/immutable/chunks/50nadQw5.js","_app/immutable/chunks/UuB358WI.js","_app/immutable/chunks/Bvo78435.js","_app/immutable/chunks/CoaZrW8W.js","_app/immutable/chunks/Dw-HbVs0.js","_app/immutable/chunks/BEL6sIsv.js","_app/immutable/chunks/3-AIV4l0.js","_app/immutable/chunks/BbBYT-As.js","_app/immutable/chunks/ftmuatC6.js","_app/immutable/chunks/69_IOA4Y.js","_app/immutable/chunks/BNkwBRBP.js","_app/immutable/chunks/BQGvbjzL.js","_app/immutable/chunks/DbIgz5ft.js","_app/immutable/chunks/qOE6JZic.js"];
const stylesheets = [];
const fonts = [];

export { component, fonts, imports, index, stylesheets, _page as universal, universal_id };
//# sourceMappingURL=19-CnZ_Cuyn.js.map
