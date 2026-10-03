const {
	setTimeout, clearTimeout,
} = require('node:timers');

module.exports = function startTyping(channel, isActive) {
	if (typeof channel.sendTyping !== 'function') return () => {};
	let stopped = false, timer;
	const stop = () => {
		stopped = true;
		clearTimeout(timer);
	};
	const refresh = async () => {
		try {
			if (stopped) return;
			if (!await isActive()) return stop();
			if (!stopped) await channel.sendTyping();
		} catch {
			// An unavailable typing indicator must never prevent the answer.
		}
		if (!stopped) {
			timer = setTimeout(refresh, 8000);
			timer.unref?.();
		}
	};
	void refresh();
	return stop;
};
