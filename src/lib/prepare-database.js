const { execFileSync } = require('child_process');
const { resolve } = require('path');

module.exports = function prepareDatabase() {
	const root = resolve(__dirname, '../..');
	execFileSync(process.execPath, [resolve(root, 'scripts/postinstall.js')], {
		cwd: root,
		env: process.env,
		stdio: 'inherit',
	});
};
