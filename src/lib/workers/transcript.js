const { expose } = require('threads/worker');
const { getTranscript } = require('../transcript-data');
expose(ticket => getTranscript(ticket));
