import { error } from '@sveltejs/kit';
export async function load({ fetch, params }) {
 const url = `/api/admin/guilds/${params.guild}/categories/${params.category}/texts`;
 const response = await fetch(url, { credentials: 'include' });
 const body = await response.json();
 if (!response.ok) error(response.status, body.message || 'Texte konnten nicht geladen werden.');
 return { ...body, url };
}
