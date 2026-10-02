/* eslint-disable no-console */
require('dotenv').config();
const fs = require('fs-extra');
const util = require('util');
const execFile = util.promisify(require('child_process').execFile);
const { short } = require('leeks.js');
const {
	resolve, join,
} = require('path');


function pathify(path) {
	return resolve(__dirname, '../', path);
}

function log(...strings) {
	console.log(short('&9[postinstall]&r'), ...strings);
}

async function prisma(...args) {
	log('> prisma ' + args.join(' '));
	const {
		stderr, stdout,
	} = await execFile(process.execPath, [
		pathify('node_modules/prisma/build/index.js'), ...args,
	], { cwd: pathify('./') });
	if (stdout) console.log(stdout.toString());
	if (stderr) console.log(stderr.toString());
}

const providers = ['mysql', 'postgresql', 'sqlite'];
const provider = process.env.DB_PROVIDER;

if (!provider) {
	log('environment not set, exiting.');
	process.exit(0);
}

if (!providers.includes(provider)) throw new Error(`DB_PROVIDER must be one of: ${providers}`);

log(`provider=${provider}`);
log(`copying ${provider} schema & migrations`);

// Keep database files in prisma/ intact; only overwrite schema/migration files.
fs.ensureDirSync(pathify('./prisma'));
fs.copySync(pathify(`./db/${provider}`), pathify('./prisma')); // copy schema & migrations

if (provider === 'sqlite' && !process.env.DB_CONNECTION_URL) {
	process.env.DB_CONNECTION_URL = 'file:' + join(process.cwd(), './user/database.db');
	log(`set DB_CONNECTION_URL=${process.env.DB_CONNECTION_URL}`);
}

(async () => {
	await prisma('migrate', 'deploy');
	await prisma('generate');
})().catch(error => {
	console.error(error);
	process.exitCode = 1;
});
