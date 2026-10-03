import { error } from '@sveltejs/kit';
export async function load({ fetch, params, url }) {
	const api = '/api/admin/guilds/' + params.guild + '/faq';
	const query = new URLSearchParams({ status: url.searchParams.get('status') || 'draft', page: url.searchParams.get('page') || '1', query: url.searchParams.get('query') || '' });
	const response = await fetch(api + '?' + query.toString(), { credentials: 'include' });
	const body = await response.json();
	if (!response.ok) error(response.status, body.message || 'FAQ konnten nicht geladen werden.');
	return { ...body, api, guildId: params.guild, status: query.get('status'), search: query.get('query') };
}
