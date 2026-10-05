import { i as store_get, u as unsubscribe_stores } from './index.js-BtYoH_uZ.js';
import { n as navigating } from './stores-CQHvZAfZ.js';
import { S as Spinner } from './Spinner-CkIadzTm.js';
import './state.svelte-KDlLh99j.js';

function _layout($$renderer, $$props) {
  $$renderer.component(($$renderer2) => {
    var $$store_subs;
    let { children } = $$props;
    $$renderer2.push(`<div class="absolute h-max min-h-screen w-full bg-dgrey-100 text-dgrey-600 dark:bg-dgrey-800 dark:text-dgrey-300">`);
    if (store_get($$store_subs ??= {}, "$navigating", navigating) || true) {
      $$renderer2.push(`<!--[0--><div class="h-dvh flex items-center justify-center">`);
      Spinner($$renderer2);
      $$renderer2.push(`<!----></div>`);
    }
    $$renderer2.push(`<!--]--></div>`);
    if ($$store_subs) unsubscribe_stores($$store_subs);
  });
}

export { _layout as default };
//# sourceMappingURL=_layout.svelte-D00HOei1.js.map
