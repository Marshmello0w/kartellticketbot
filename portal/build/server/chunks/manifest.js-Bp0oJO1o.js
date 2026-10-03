const manifest = (() => {
function __memo(fn) {
	let value;
	return () => value ??= (value = fn());
}

return {
	appDir: "_app",
	appPath: "_app",
	assets: new Set(["assets/topgg-dark.webp","assets/topgg-light.webp","assets/undraw_reviews.svg","assets/wordmark-dark.png","assets/wordmark-light.png","favicon.png"]),
	mimeTypes: {".webp":"image/webp",".svg":"image/svg+xml",".png":"image/png"},
	_: {
		client: {start:"_app/immutable/entry/start.CjwUm9G5.js",app:"_app/immutable/entry/app.WgaFqESn.js",imports:["_app/immutable/entry/start.CjwUm9G5.js","_app/immutable/chunks/pHwGw5UV.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/ByYfV3AA.js","_app/immutable/chunks/03FJNrH_.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/entry/app.WgaFqESn.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/ws1_gvEc.js","_app/immutable/chunks/CchGQewc.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/DfwKcliI.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DaKtgLGk.js","_app/immutable/chunks/v0Azh4s9.js","_app/immutable/chunks/CzqlrPJi.js","_app/immutable/chunks/67W2KX7y.js","_app/immutable/chunks/ZENfGddi.js","_app/immutable/chunks/CJ2jmA2a.js","_app/immutable/chunks/nbOe66zO.js","_app/immutable/chunks/03FJNrH_.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./0-SylsStSU.js')),
			__memo(() => import('./1-CYpQigMS.js')),
			__memo(() => import('./2-BlqPJEru.js')),
			__memo(() => import('./3-2VrrLEo1.js')),
			__memo(() => import('./4-GK1e7Dxw.js')),
			__memo(() => import('./5-wWh4Njao.js')),
			__memo(() => import('./6-DrSUwWcw.js')),
			__memo(() => import('./7-CF3aJmcY.js')),
			__memo(() => import('./8-Be_jpYXu.js')),
			__memo(() => import('./9-CvOzy2D5.js')),
			__memo(() => import('./10-1wAf8HVW.js')),
			__memo(() => import('./11-CnBLA4vw.js')),
			__memo(() => import('./12-DzpjXVOR.js')),
			__memo(() => import('./13-4HtGlTeL.js')),
			__memo(() => import('./14-Cc6ufOo_.js')),
			__memo(() => import('./15-Ch7vl38Z.js')),
			__memo(() => import('./16-dgwi3Ksf.js')),
			__memo(() => import('./17-CSP-WXqZ.js')),
			__memo(() => import('./18-Cbz4iVE6.js')),
			__memo(() => import('./19-ClHeR8Pl.js')),
			__memo(() => import('./20-ChruAB0q.js')),
			__memo(() => import('./21-CPU1I_HM.js')),
			__memo(() => import('./22-CFwinEQI.js')),
			__memo(() => import('./23-CcVas9i8.js')),
			__memo(() => import('./24-fP5mzQG7.js')),
			__memo(() => import('./25-DC6wyaNW.js')),
			__memo(() => import('./26-DiJAGF_w.js'))
		],
		remotes: {
			
		},
		routes: [
			{
				id: "/(default)",
				pattern: /^\/$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,3,], leaf: 8 },
				endpoint: null
			},
			{
				id: "/(default)/invite",
				pattern: /^\/invite\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,3,], leaf: 9 },
				endpoint: null
			},
			{
				id: "/(default)/login",
				pattern: /^\/login\/?$/,
				params: [],
				page: { layouts: [0,2,], errors: [1,3,], leaf: 10 },
				endpoint: null
			},
			{
				id: "/settings",
				pattern: /^\/settings\/?$/,
				params: [],
				page: { layouts: [0,5,], errors: [1,6,], leaf: 16 },
				endpoint: null
			},
			{
				id: "/settings/[guild]",
				pattern: /^\/settings\/([^/]+?)\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,], errors: [1,6,], leaf: 17 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/categories",
				pattern: /^\/settings\/([^/]+?)\/categories\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 18 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/categories/[category]",
				pattern: /^\/settings\/([^/]+?)\/categories\/([^/]+?)\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false},{"name":"category","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 19 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/categories/[category]/texts",
				pattern: /^\/settings\/([^/]+?)\/categories\/([^/]+?)\/texts\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false},{"name":"category","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 20 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/faq",
				pattern: /^\/settings\/([^/]+?)\/faq\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 21 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/feedback",
				pattern: /^\/settings\/([^/]+?)\/feedback\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,], errors: [1,6,], leaf: 22 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/general",
				pattern: /^\/settings\/([^/]+?)\/general\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 23 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/panels",
				pattern: /^\/settings\/([^/]+?)\/panels\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 24 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/tags",
				pattern: /^\/settings\/([^/]+?)\/tags\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 25 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/texts",
				pattern: /^\/settings\/([^/]+?)\/texts\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 26 },
				endpoint: null
			},
			{
				id: "/(default)/view/[ticket]",
				pattern: /^\/view\/([^/]+?)\/?$/,
				params: [{"name":"ticket","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,2,], errors: [1,3,], leaf: 11 },
				endpoint: null
			},
			{
				id: "/(default)/[guild]",
				pattern: /^\/([^/]+?)\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,2,4,], errors: [1,3,,], leaf: 12 },
				endpoint: null
			},
			{
				id: "/(default)/[guild]/feedback",
				pattern: /^\/([^/]+?)\/feedback\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,2,4,], errors: [1,3,,], leaf: 13 },
				endpoint: null
			},
			{
				id: "/(default)/[guild]/staff",
				pattern: /^\/([^/]+?)\/staff\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,2,4,], errors: [1,3,,], leaf: 14 },
				endpoint: null
			},
			{
				id: "/(default)/[guild]/tickets",
				pattern: /^\/([^/]+?)\/tickets\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,2,4,], errors: [1,3,,], leaf: 15 },
				endpoint: null
			}
		],
		prerendered_routes: new Set([]),
		matchers: async () => {
			
			return {  };
		},
		server_assets: {}
	}
}
})();

export { manifest as m };
//# sourceMappingURL=manifest.js-Bp0oJO1o.js.map
