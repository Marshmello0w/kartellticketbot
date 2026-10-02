const routes = require('../../../../../../../lib/text-settings');
module.exports.get = fastify => routes(fastify, true).get();
module.exports.patch = fastify => routes(fastify, true).patch();
