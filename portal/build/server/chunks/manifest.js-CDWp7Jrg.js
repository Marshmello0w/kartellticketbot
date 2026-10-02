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
		client: {start:"_app/immutable/entry/start.Ce1l7dzr.js",app:"_app/immutable/entry/app.sNvFxNwI.js",imports:["_app/immutable/entry/start.Ce1l7dzr.js","_app/immutable/chunks/3-AIV4l0.js","_app/immutable/chunks/DFjlfogR.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/-UyI9lYi.js","_app/immutable/chunks/BbBYT-As.js","_app/immutable/chunks/CoaZrW8W.js","_app/immutable/chunks/B0XwC4Ot.js","_app/immutable/entry/app.sNvFxNwI.js","_app/immutable/chunks/Dp1pzeXC.js","_app/immutable/chunks/BAB4lnyF.js","_app/immutable/chunks/CHlqn90R.js","_app/immutable/chunks/DIeogL5L.js","_app/immutable/chunks/BPp7PsFn.js","_app/immutable/chunks/Bzak7iHL.js","_app/immutable/chunks/DFjlfogR.js","_app/immutable/chunks/BBpVbx05.js","_app/immutable/chunks/DE5Iowad.js","_app/immutable/chunks/DbIgz5ft.js","_app/immutable/chunks/Dw-HbVs0.js","_app/immutable/chunks/UuB358WI.js","_app/immutable/chunks/Bvo78435.js","_app/immutable/chunks/CoaZrW8W.js"],stylesheets:[],fonts:[],uses_env_dynamic_public:false},
		nodes: [
			__memo(() => import('./0-BQu065TE.js')),
			__memo(() => import('./1-xy-Cnhco.js')),
			__memo(() => import('./2-CG6lzJNR.js')),
			__memo(() => import('./3-BWf3x_L9.js')),
			__memo(() => import('./4-Djy2dOsE.js')),
			__memo(() => import('./5-CVxGOYq4.js')),
			__memo(() => import('./6-C_eEjaIg.js')),
			__memo(() => import('./7-CdJ34JU-.js')),
			__memo(() => import('./8-D-QX5ax5.js')),
			__memo(() => import('./9-B5Pwb09p.js')),
			__memo(() => import('./10-YOX8Q5Vo.js')),
			__memo(() => import('./11-CnBLA4vw.js')),
			__memo(() => import('./12-BxN4bGgn.js')),
			__memo(() => import('./13-4HtGlTeL.js')),
			__memo(() => import('./14-Cc6ufOo_.js')),
			__memo(() => import('./15-Ch7vl38Z.js')),
			__memo(() => import('./16-BKr_d2pl.js')),
			__memo(() => import('./17-BQP7ipTn.js')),
			__memo(() => import('./18-DJ01zhPq.js')),
			__memo(() => import('./19-CnZ_Cuyn.js')),
			__memo(() => import('./20-ekbUTdsB.js')),
			__memo(() => import('./21-03PVgJVw.js')),
			__memo(() => import('./22-BTzMvwR2.js')),
			__memo(() => import('./23-ZlDmlWgs.js')),
			__memo(() => import('./24-BQoeBGqy.js')),
			__memo(() => import('./25-Cj7Bivai.js'))
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
				id: "/settings/[guild]/feedback",
				pattern: /^\/settings\/([^/]+?)\/feedback\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 21 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/general",
				pattern: /^\/settings\/([^/]+?)\/general\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 22 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/panels",
				pattern: /^\/settings\/([^/]+?)\/panels\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 23 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/tags",
				pattern: /^\/settings\/([^/]+?)\/tags\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 24 },
				endpoint: null
			},
			{
				id: "/settings/[guild]/texts",
				pattern: /^\/settings\/([^/]+?)\/texts\/?$/,
				params: [{"name":"guild","optional":false,"rest":false,"chained":false}],
				page: { layouts: [0,5,7,], errors: [1,6,,], leaf: 25 },
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
//# sourceMappingURL=manifest.js-CDWp7Jrg.js.map
