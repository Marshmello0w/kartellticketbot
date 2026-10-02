const { driveStatus } = require('../../../../../lib/drive-archive');

module.exports.get = fastify => ({
	handler: req => driveStatus(req.routeOptions.config.client, req.params.guild),
	onRequest: [fastify.authenticate, fastify.isAdmin],
});
