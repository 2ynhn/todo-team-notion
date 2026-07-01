let configAlert, uploadAlertTimer, uploadAlertTime;

(async function () {
	await fetch('./config.json')
		.then((response) => response.json())
		.then((configAlert) => {
			if(configAlert.uploadAlertTime){
                uploadAlertTime = configAlert.uploadAlertTime;
                uploadAlertTimer = setInterval(checkTime, 1000);
            }
		});
})();

function checkTime() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
   
    const currentTime = `${hours}:${minutes}`;
   
    // 목표 시간이 되었을 때
    if (currentTime === uploadAlertTime) {
        alert(`지정한 시간 ${uploadAlertTime} 입니다!`);
        clearInterval(uploadAlertTimer);
    }
}