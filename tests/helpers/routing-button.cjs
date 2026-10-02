const { Button } = require('@eartharoid/dbf');

module.exports = class extends Button {
 constructor(client, options) {
  super(client, { ...options, id: 'routing-test' });
 }
 async run(id, interaction) {
  this.client.routingCalls.push({ id, interaction });
 }
};
