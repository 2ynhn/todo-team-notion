(function () {
	console.log('init ui.js');
	// 공통 함수수
	toggleSide();
	keywordInit();
	dateColorize();
	markWeekStart();

	// master, user 별 함수
	if (AppState.masterId == AppState.activeUser) {
		uptodate();
	} else {
	}
})();

// 다음날자로 변경
function uptodate() {
	const li = document.querySelectorAll('.li');
	li.forEach((item) => {
		const upBtn = `
            <div class="fn-update"><button>Set to Next Day</button></div>
        `;
		item.insertAdjacentHTML('beforeend', upBtn);
		const btn = item.querySelector('.fn-update button');
		btn.addEventListener('click', function () {
			const thisID = item.getAttribute('id');
			const today = item.querySelector('.date').innerHTML;
			const nextday = new Date(today);
			nextday.setUTCDate(nextday.getUTCDate() + 1);
			const next = nextday.toISOString().substr(0, 10);
			AppState.todos.map(function (a) {
				if (a.id == thisID) {
					a.date = next;
				}
			});
			saveTodos();
			renderTodos(AppState.todos);
		});
	});
}

// colorize date and Marking by {dateArr}
function dateColorize() {
	// get dates
	let dateArr = []; // result [-3day, -2day, yesterday, today, tomorrow, +2day, +3day]
	const dateCalc = 86400000; // 1 day is 86400000
	let dateSets_i = -3;
	while (dateSets_i < 4) {
		// before 3days ~ next 3day
		var yyyy, dd, mm;
		var dateTemp = new Date(new Date().getTime() + dateCalc * dateSets_i);
		yyyy = dateTemp.getFullYear();
		mm = dateTemp.getMonth() + 1;
		dd = dateTemp.getDate();
		mm < 10 ? (mm = '0' + mm) : (mm = mm);
		dd < 10 ? (dd = '0' + dd) : (dd = dd);
		var curDate = yyyy + '-' + mm + '-' + dd;
		dateArr.push(curDate);
		dateSets_i++;
	}

	const lists = document.querySelectorAll('.li');
	lists.forEach((that) => {
		var date = that.querySelector('.date');
		var k = 0;
		while (k < dateArr.length) {
			if (date.innerHTML === dateArr[k]) {
				that.classList.add('day-in' + (k - 3));
				break;
			}
			k++;
		}
	});
}

// add keywords by [] in title
function keywordInit() {
	const lists = document.querySelectorAll('.li');
	let keywords = [];
	lists.forEach((that) => {
		// keywords 추출
		let title = that.querySelector('span.title');
		if (
			title.innerHTML.indexOf('[') > -1 &&
			title.innerHTML.indexOf(']') > -1
		) {
			var keywordOrigin = title.innerHTML.match(/\[.*\]/gi);
			keywordOrigin += '';
			var keyword = keywordOrigin.split('[').join('');
			keyword = keyword.split(']').join('');
			if (keyword.indexOf(',') > -1) {
				keyword = keyword.replace(/\s/g, '');
				var keys = keyword.split(',');
				keywords = keywords.concat(keys);
				keywords = keywords.filter(
					(item, pos) => keywords.indexOf(item) === pos
				);
			} else if (keywords.indexOf(keyword) === -1) {
				keywords.push(keyword);
			}
			// li에 keyword가 있으면 class추가
			for (var n = 0; n < keywords.length; n++) {
				if (keywordOrigin.indexOf(keywords[n]) > -1) {
					that.classList.add('key-' + n);
				}
			}
		}
	});

	const side = document.getElementById('side');
	const keyWrap = document.getElementById('keywords');
	if (keyWrap === null) {
		const keyElement = document.createElement('div');
		keyElement.id = 'keywords';
		side.appendChild(keyElement);
	} else {
		if (keyWrap.childNodes.length) {
			keyWrap.innerHTML = '';
		}
	}
	for (var j = 0; j < keywords.length; j++) {
		const keys = document.getElementById('keywords');
		const tag =
			'<a href="javascript:void(0)" class="keyword" key_value="key-' +
			j +
			'">' +
			keywords[j] +
			'</a>';
		keys.insertAdjacentHTML('beforeend', tag);
	}

	const keyBtns = document.querySelectorAll(`a[key_value*="key-"]`);
	keyBtns.forEach((i) => {
		i.addEventListener('click', function () {
			const keyclass = this.getAttribute('key_value');
			const tagLi = document.querySelectorAll('.li.' + keyclass);
			if (this.classList.contains('active')) {
				this.classList.remove('active');
				tagLi.forEach((item) => {
					item.classList.remove('list-checked');
				});
			} else {
				this.classList.add('active');
				tagLi.forEach((item) => {
					item.classList.add('list-checked');
				});
			}
			return false;
		});
	});
}

// view Detail
function deployView(obj) {
	const li = obj.parentNode.parentNode;
	var thisID = li.getAttribute('id');

	var cont, commit;
	AppState.tabTodos.map(function (a) {
		if (a.id == thisID) {
			cont = a.detail;
			commit = a.commit;
		}
	});
	displayCurrent(thisID);
	toLayer(cont, commit);
}

function displayCurrent(id) {
	const lists = document.querySelectorAll('.li');
	lists.forEach((li) => {
		li.classList.remove('current');
	});
	document.querySelector('#' + id).classList.add('current');
}

function toLayer(cont, cmmt) {
	// console.log(cont, cmmt);
	const content = cont ? cont.replace(/\n/g, '<br>') : '';
	const commit = cmmt ? cmmt : '';
	const button = cmmt ? '<button onclick="this.previousElementSibling.click(); viewCommitLog();">키워드 복사 + bash 창 열기</button>' : '';
	const layer = `
		<div class="layer">
			<div class="cont">
				<div class="commit">커밋 키워드: <span onclick="copyString(this)">${commit}</span></div>
				<div class="str">${content}</div>
			</div>
		</div>
	`;
	document.documentElement.insertAdjacentHTML('beforeend', layer);
	const layerCont = document.querySelector('.layer .cont');
	layerCont.addEventListener('click', function (e) {
		e.preventDefault();
	});
}
function layerRemove() {
	const layer = document.querySelector('.layer');
	layer.remove();

	const lists = document.querySelectorAll('.li');
	lists.forEach((li) => {
		li.classList.remove('current');
	});
	// setTimeout(function(){$('.li').removeClass('current');}, 5000);
}
document.documentElement.addEventListener('click', function (e) {
	const layer = document.querySelector('.layer');
	if (!layer) {
		return;
	}
	if (e.target.classList.contains('layer')) {
		layerRemove();
	} else {
	}
});

function toggleSide() {
	const buttons = document.querySelectorAll('.toggle-side');
	const side = document.querySelector('#side');
	buttons.forEach((btn) => {
		btn.addEventListener('click', function () {
			if (side.classList.contains('expand')) {
				side.classList.remove('expand');
			} else {
				side.classList.add('expand');
			}
		});
	});
}

function markWeekStart() {
	const items = Array.from(document.querySelectorAll('.li'));
	// 날짜와 요소를 매핑하여 배열 생성
	const dateItems = items.map((item) => {
		const dateStr = item.querySelector('.date').textContent.trim(); // 예: "2024-02-18"
		return { element: item, date: new Date(dateStr), dateStr };
	});
	// 날짜는 이미 내림차순 정렬되어 있음
	const weeks = new Map(); // 주별 그룹 저장
	dateItems.forEach(({ element, date, dateStr }) => {
		const year = date.getFullYear();
		const weekNumber = getWeekNumber(date); // 해당 날짜의 주차 구하기
		const key = `${year}-${weekNumber}`;
		if (!weeks.has(key)) {
			weeks.set(key, []);
		}
		weeks.get(key).push({ element, date, dateStr });
	});
	// 각 주별로 일요일 찾기 (없으면 가장 빠른 요일 선택)
	weeks.forEach((weekItems) => {
		let sundayItem = [...weekItems]
			.reverse()
			.find(({ date }) => date.getDay() === 6); // 토요일 찾기 (뒤에서부터)
		if (!sundayItem) {
			// 일요일이 없으면 가장 빠른 날짜 찾기 (뒤에서부터)
			const earliestDateStr = weekItems[weekItems.length - 1].dateStr;
			sundayItem = [...weekItems]
				.reverse()
				.find(({ dateStr }) => dateStr === earliestDateStr);
		}
		// 중복된 날짜가 있을 경우, 가장 마지막 `.item`만 선택
		if (sundayItem) {
			const lastMatchingItem = [...weekItems]
				.reverse()
				.find(({ dateStr }) => dateStr === sundayItem.dateStr);
			lastMatchingItem.element.classList.add('week-devide');
		}
	});
}
// 특정 날짜의 주차를 계산하는 함수
function getWeekNumber(date) {
	const start = new Date(date.getFullYear(), 0, 1); // 해당 연도의 1월 1일
	const diff = Math.floor((date - start) / (1000 * 60 * 60 * 24)); // 일 수 차이 계산
	return Math.floor((diff + start.getDay()) / 7); // 주차 반환
}

// 클립보드로 카피
function copyString(element){
	// 요소의 텍스트 콘텐츠를 가져옴
    const textToCopy = element.textContent;
    // 클립보드에 텍스트를 비동기적으로 씀
    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        console.log("텍스트가 클립보드에 복사되었습니다.");
        // 복사 성공 시 사용자에게 알리는 피드백 제공 (선택 사항)
        // alert("클립보드에 복사되었습니다: " + textToCopy);
      })
      .catch(err => {
        console.error("클립보드 복사에 실패했습니다: ", err);
      });
}

//
async function viewCommitLog(){
	const response = await fetch('/run-commit-log');
}