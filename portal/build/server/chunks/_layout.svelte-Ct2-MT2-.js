import { m as head, o as attr } from './index.js-Dq6FKNv5.js';

function _layout($$renderer, $$props) {
  let { data, children } = $$props;
  const { guild } = data;
  head("oq2bo2", $$renderer, ($$renderer2) => {
    $$renderer2.push(`<link rel="icon"${attr("href", `${guild.logo}`)}/>`);
  });
  $$renderer.push(`<div>`);
  children?.($$renderer);
  $$renderer.push(`<!----></div>`);
}

export { _layout as default };
//# sourceMappingURL=_layout.svelte-Ct2-MT2-.js.map
