(function () {
	console.log('init month.js');
	createCheckExist_style(); // style 추가 & 중복 로드 방지
	createCheckExist_mmCont(); // mmCont 추가 & 중복 로드 방지
	mMonthInit(AppState.todos);

	// master, user 별 함수
	if (AppState.masterId == AppState.activeUser) {
	} else {
	}
})();

function createCheckExist_mmCont() {
	let id = 'mmCont';
	let mmCont = document.getElementById(id);
	if (!mmCont) {
		mmCont = document.createElement('div');
		mmCont.id = id;
		document.getElementById('side').appendChild(mmCont);
	} else {
		mmCont.innerHTML = '';
	}
}

function createCheckExist_style() {
	let id = 'mmContStyle';
	let mmContStyle = document.getElementById(id);
	if (!mmContStyle) {
		mmContStyle = document.createElement('style');
		mmContStyle.id = id;
		const str = `
			#Ymonth {display: inline-flex;}
			.li .month {font-size:0.8rem; display: inline-flex; color:rgb(149, 196, 20);}
			#mmCont {margin-top: 24px; height: 30vh; overflow-y: auto; padding:12px; border:1px solid var(--line); border-radius:var(--button-radius);} 
			#mmCont::before {content: 'Man/Month'; color: var(--point-1); display:block; margin-bottom: 8px; font-weight: 700; font-size: 1.1rem;}
			#mmCont .mm {display:block; font-size:0.8rem; border-radius:8px; padding:2px 8px; margin:0 6px 4px; white-space:nowrap;}
			#mmCont .mm > span {font-size: 0.9rem; color: var(--color-2);}
			#mmCont .mm .mm_txt {color:var(--point-2);}
		`;
		mmContStyle.innerHTML = str;
		document.head.appendChild(mmContStyle);
	}
}

function filterByMonth(arr) {
	return arr.filter((obj) => obj.hasOwnProperty('month'));
}

function mMonthInit(obj) {
	createCheckExist_mmCont();
	let monthlySums = {};
	let mDos = [];
	mDos = filterByMonth(obj);
	mDos.forEach(function (item) {
		// MM 합 구하기
		var date = new Date(item.date);
		var monthh = date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0');

		if (!monthlySums[monthh]) {
			monthlySums[monthh] = 0;
		}
		var sumVal = parseFloat(item.month);
		if (!isNaN(sumVal)) {
			monthlySums[monthh] += sumVal;
		}
	});

	let startArray = 0;

	if (typeof monthlySums === 'object' && monthlySums !== null) {
		var keys = Object.keys(monthlySums).slice(startArray);

		keys.forEach(function (item) {
			var value = monthlySums[item];
			if (value === 0) {
				value = 0;
			} else {
				value = value.toFixed(2);
			}
			var div = `<div class="mm">
				<span class="date_txt">${item}</span>
				<span class="mm_txt">${value}</span>
			</div>`;
			const m = document.querySelector('#mmCont');
			m.insertAdjacentHTML('beforeend', div);
		});
	} else {
		console.error('monthlySums is not a valied object');
	}
}
