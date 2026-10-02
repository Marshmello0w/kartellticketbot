const routes = require('../../../../../lib/text-settings');
module.exports.get = fastify => routes(fastify, false).get();
module.exports.patch = fastify => routes(fastify, false).patch();
