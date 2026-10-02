import { error, redirect } from '@sveltejs/kit';

export async function load({ fetch, params, url }) {
	const query = new URLSearchParams({ page: url.searchParams.get('page') || '1' });
	const response = await fetch(`/api/admin/guilds/${params.guild}/feedback?${query}`);
	const isJSON = response.headers.get('Content-Type')?.includes('json');
	const body = isJSON ? await response.json() : await response.text();
	if (response.status === 401 && body?.elevate) {
		redirect(307, `/auth/login?r=${encodeURIComponent(url.pathname + url.search)}&role=${body.elevate}`);
	}
	if (!response.ok) error(response.status, body?.message || body || 'Feedback konnte nicht geladen werden.');
	return { feedback: body };
}
