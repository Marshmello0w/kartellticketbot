import { b as setContext, c as attr_class, d as clsx } from './index.js-ppjCynu5.js';
import './index-CjTFt12i.js';

function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    let { data, children } = $$props;
    const { client, user, theme, locale } = data;
    setContext("client", client);
    setContext("user", user);
    setContext("theme", theme);
    setContext("locale", locale);
    $$renderer2.push(`<div${attr_class(clsx(theme))}>`);
    children?.($$renderer2);
    $$renderer2.push(`<!----></div>`);
  });
}

export { _layout as default };
//# sourceMappingURL=_layout.svelte-pTWSj0dU.js.map
