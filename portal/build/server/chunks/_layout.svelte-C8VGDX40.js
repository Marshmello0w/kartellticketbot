import { m as head, o as attr } from './index.js-COx5E4B1.js';

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
//# sourceMappingURL=_layout.svelte-C8VGDX40.js.map
