const spacetime = require('spacetime');
const ExtendedEmbedBuilder = require('./embed');

function workingHoursStatus(settings, instant = new Date()) {
	if (!Array.isArray(settings) || typeof settings[0] !== 'string') throw new Error('Invalid working hours');
	const now = spacetime(instant, settings[0]);
	if (!now.isValid()) throw new Error('Invalid working hours time');
	const today = now.startOf('day');
	const interval = day => {
		const hours = settings[day.day() + 1];
		if (!Array.isArray(hours) || hours.length !== 2 || hours.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) || hours[0] === hours[1]) return null;
		// Each weekday defines the shift starting that day. An earlier end time
		// belongs to the next calendar day, including across DST and week changes.
		return {
			start: day.time(hours[0]).epoch,
			end: (hours[1] < hours[0] ? day.add(1, 'day') : day).time(hours[1]).epoch,
		};
	};
	for (const day of [today.subtract(1, 'day'), today]) {
		const shift = interval(day);
		if (shift && now.epoch >= shift.start && now.epoch < shift.end) {
			return {
				working: true,
				next: null,
			};
		}
	}
	for (let offset = 0; offset <= 7; offset++) {
		const shift = interval(today.add(offset, 'day'));
		if (shift && shift.start > now.epoch) {
			return {
				working: false,
				next: {
					timestamp: Math.floor(shift.start / 1000),
					today: offset === 0,
				},
			};
		}
	}
	return {
		working: false,
		next: null,
	};
}

async function sendWorkingHoursNotice(channel, guild, getMessage, instant = new Date()) {
	const status = workingHoursStatus(guild.workingHours, instant);
	if (status.next) {
		const key = 'ticket.working_hours.' + (status.next.today ? 'today' : 'next');
		await channel.send({
			allowedMentions: { parse: [] },
			embeds: [new ExtendedEmbedBuilder()
				.setColor(guild.primaryColour)
				.setTitle(getMessage(key + '.title'))
				.setDescription(getMessage(key + '.description', { timestamp: status.next.timestamp }))],
		});
	}
	return status;
}

module.exports = {
	workingHoursStatus,
	sendWorkingHoursNotice,
};
