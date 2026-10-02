export function flatten(object) {
	// specifically instance of Error, not API responses which may have other properties
	object = object instanceof Error ? { message: object.message } : object;
	if (object === null || typeof object !== 'object') return String(object);
	const entries = [];
	for (let [k, v] of Object.entries(object)) {
		if (typeof v === 'string') {
			try {
				// Only expand JSON containers. Numeric strings include Discord IDs,
				// which lose precision when parsed as JavaScript numbers.
				if (/^\s*[\[{]/.test(v)) {
					const j = JSON.parse(v);
					if (j !== null && typeof j === 'object') v = flatten(j);
				}
			} catch {
				/* empty */
			}
		} else if (v !== null && typeof v === 'object') {
			v = flatten(v);
		} else {
			v = String(v);
		}
		entries.push([k, v]);
	}
	return entries;
}
