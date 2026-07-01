(function () {
	console.log('init reload-everyday.js');
	reloadEveryDay(); // 매일 00시에 페이지 리로드 하기

	// master, user 별 함수
	if (masterId == activeUser) {
	} else {
	}
})();

function reloadEveryDay() {
	let now = new Date();
	let midnight = new Date();
	midnight.setHours(24);
	midnight.setMinutes(0);
	midnight.setSeconds(0);
	midnight.setMilliseconds(0);
	let timeLeft = midnight.getTime() - new Date().getTime();
	if (now > midnight) {
		return;
	} else {
		setTimeout(function () {
			alert('reload');
			window.location.reload(true);
		}, timeLeft);
	}
}
