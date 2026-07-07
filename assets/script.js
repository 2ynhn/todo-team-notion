const todoTitle = document.getElementById('Ytitle');
const todoDetail = document.getElementById('Ydeploy');
const todoDate = document.getElementById('Ydate');
const todoUrl = document.getElementById('Yurl');
const todoCommit = document.getElementById('Ycommit');
const todoMonth = document.getElementById('Ymonth');
const addButton = document.getElementById('Ysubmit');
const todoList = document.getElementById('todo-list');
const loadButton = document.getElementById('load-button');
const fileInput = document.getElementById('file-input');
const saveButton = document.getElementById('save-button');
const themeSelect = document.getElementById('theme-select');
let todos = [];
let tabTodos = [];
let tempLi = '';
let tempTodo = {};
let limit = Infinity;

// Ctrl+Z 되돌리기용: 마지막으로 저장 성공한 시점의 todos 스냅샷(직렬화 문자열).
// saveTodos()가 새 값을 저장하기 "직전"에 이 값을 localStorage로 옮겨 undo 대상으로 삼고,
// 그 다음 이번에 저장하는 값으로 갱신한다.
let lastSavedSnapshot = null;
const UNDO_STORAGE_KEY = 'todoUndoSnapshot';

// 플래그(항목 마킹) 표시는 서버에 저장하지 않고 브라우저 localStorage에만 남긴다.
// 화면을 새로고침하거나 다른 뷰를 다녀와도 renderTodos()가 다시 그릴 때 이 목록을
// 기준으로 .flag 클래스를 복원한다.
const FLAG_STORAGE_KEY = 'todoFlaggedIds';

function getFlaggedIds() {
	try {
		const raw = localStorage.getItem(FLAG_STORAGE_KEY);
		return new Set(raw ? JSON.parse(raw) : []);
	} catch (e) {
		console.error('flag 목록 로드 실패:', e);
		return new Set();
	}
}

function saveFlaggedIds(idSet) {
	try {
		localStorage.setItem(FLAG_STORAGE_KEY, JSON.stringify([...idSet]));
	} catch (e) {
		console.error('flag 목록 저장 실패:', e);
	}
}

// users by config.json
let config, users, masterId, activeUser, fileID, uploadLastDay;

(async function () {
	await fetch('/masterUserId')
		.then((response) => response.json())
		.then((data) => {
			if (data.masterId) {
				masterId = data.masterId;
				console.log('Master ID:', masterId);
			} else {
				renderTodos(todos);
			}
		});

	await fetch('./config.json')
		.then((response) => response.json())
		.then((config) => {
			if (config && config.users && Array.isArray(config.users)) {
				// users를 사용하여 탭 생성 및 이벤트 처리
				users = config.users;
				if (config.limit && config.limit > 1) {
					limit = config.limit;
				}
				usersInit(users);
				initTopbarChrome();
				initLimitSegmented();
				renderTeamStatusCard();

				// 상단바 로고 텍스트 적용
				const logoEl = document.getElementById('topbar-logo');
				if (logoEl) logoEl.textContent = config.logoText || '';

				// theme css를 적용
				if (config.theme) {
					const link = document.createElement('link');
					link.rel = 'stylesheet';
					link.href = `./assets/${config.theme}`; // 테마에 맞는 CSS 파일 로드
					document.head.appendChild(link);
				}

				// 업로드 할 기간 설정
				if(config.uploadLastDay) {
					uploadLastDay = config.uploadLastDay;
				}
			}
		});

	themeSwitchInit();
})();

// 테마 선택 드롭다운 초기화
async function themeSwitchInit() {
	const select = themeSelect;
	if (!select) return;

	try {
		const res = await fetch('/themes');
		const data = await res.json();
		const current = (config && config.theme) || data.current || '';

		select.innerHTML = '';

		// 항상 로드되는 base (선택 불가)
		const baseOpt = document.createElement('option');
		baseOpt.value = data.base || 'style.css';
		baseOpt.textContent = `${data.base || 'style.css'} (base · always on)`;
		baseOpt.disabled = true;
		select.appendChild(baseOpt);

		// 테마 없이 base만 사용하는 상태 (Light)
		const lightOpt = document.createElement('option');
		lightOpt.value = '';
		lightOpt.textContent = 'Light (테마 없음)';
		select.appendChild(lightOpt);

		(data.themes || []).forEach((file) => {
			const opt = document.createElement('option');
			opt.value = file;
			opt.textContent = file;
			if (file === current) opt.selected = true;
			select.appendChild(opt);
		});

		// theme 가 비었거나 목록에 없으면 Light(테마 없음)를 선택 상태로 표시
		if (!current || !(data.themes || []).includes(current)) {
			lightOpt.selected = true;
		}

		select.addEventListener('change', async () => {
			const theme = select.value;
			try {
				const r = await fetch('/config/theme', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ theme }),
				});
				if (!r.ok) throw new Error(`status ${r.status}`);
				location.reload();
			} catch (e) {
				console.error('theme update failed:', e);
				alert('테마 변경에 실패했습니다.');
			}
		});

		initThemeGrid();
	} catch (e) {
		console.error('theme list load failed:', e);
	}
}

async function usersInit(users) {
	const tabs = document.querySelector('.tabs');
	users.forEach((user) => {
		if (user.active) {
			const tab = document.createElement('button');
			tab.classList.add('tab');
			tab.dataset.userId = user.id;
			tab.textContent = user.name;
			tabs.appendChild(tab);
			tab.addEventListener('click', () => {
				loadingInit();
				const userId = tab.dataset.userId;
				loadTodoData(userId);
				setMasterOnlyState(user.id == masterId);
			});
			if (user.id == masterId) {
				tab.classList.add('active');
				tab.click();
			}
		}
	});
}

// master 유저의 데이터에만 적용되는 컨트롤(등록 폼 / 업로드 / 데이터 관리)을
// 다른 유저 탭을 보는 동안에는 비활성화
function setMasterOnlyState(isMaster) {
	const form = document.querySelector('.js-toDoForm');
	const uploadBtn = document.getElementById('upload-button');
	const dataActions = document.querySelector('.data-actions');
	[form, uploadBtn, dataActions].forEach((el) => {
		if (el) el.classList.toggle('avoid', !isMaster);
	});
}

async function currentTabInit(userId) {
	const tabButtons = document.querySelectorAll('.tab');
	tabButtons.forEach((t) => {
		t.classList.remove('active');
		if (t.dataset.userId == userId) {
			t.classList.add('active');
		}
	});
}

async function loadTodoData(userId) {
	if (userId === masterId) {
		const response = await fetch(`./data/${userId}.json`);
		let todoData = await response.json();
		todoData.sort((a, b) => new Date(b.date) - new Date(a.date)); //sort by date
		activeUser = userId; // activeUser = userId;

		countingTodo(todoData)
		renderTodos(todoData.slice(0, limit));
		tabTodos = todoData;
		currentTabInit(userId);
		todos = todoData;
		loadingRemove();
		console.log(userId);
		// 새로고침 직후 첫 변경사항도 되돌릴 수 있도록, 로드 시점 상태를 기준으로 삼는다.
		lastSavedSnapshot = JSON.stringify(todoData);
	} else {
		const fileContent = await fetchNotionFiles(userId);
		// fetchNotionFiles는 로드 실패 시 (alert 후) null을 반환한다
		todos = (fileContent && fileContent.todos) || [];
		console.log(todos);
		activeUser = userId;
		countingTodo(todos);
		renderTodos(todos.slice(0, limit));
		tabTodos = todos;
		currentTabInit(userId);
		loadingRemove();
	}
}

function countingTodo(src) {
	let countTodo = src.length;
	let summaryCount = document.getElementById('count');
	summaryCount.innerHTML = `${countTodo}`
}

function getDateFromCreated(stamp){
	let unix_timestamp = stamp;
	var date = new Date(unix_timestamp * 1000);
	var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
	var month = months[date.getMonth()];
	var day = date.getDate();
	var hours = date.getHours();
	var minutes = "0" + date.getMinutes();
	var seconds = "0" + date.getSeconds();
	var formattedTime = month + '/' + day + ', ' + hours + ':' + minutes.substr(-2) + ':' + seconds.substr(-2);
	console.log(formattedTime);
}

function generateId() {
	return 'p' + Math.random().toString(36).substring(2, 15);
}

async function renderLimitTodos() {
	try {
		const response = await fetch(`./config.json`);
		const config = await response.json();
		const limit = config.limit || 100;
	} catch (error) {
		console.error('config.json 로드 에러');
	}
}

// 목록/편집-저장 뷰 두 곳에서 동일한 행 마크업을 쓰기 위한 공용 빌더.
// 노션 URL / 커밋 / M-M / detail 중 값이 없는 항목이 있어도 열이 항상 맞도록
// (grid-head 와 동일한 --row-cols 그리드에 맞춰) 빈 칸(placeholder)을 채운다.
function buildTodoRowHTML(todo, isMaster) {
	const hasUrl = !!(todo.url && todo.url !== 'undefined');
	const urlCell = hasUrl
		? `<a href="${todo.url}" class="url" title="${todo.url}" target="_blank">Notion</a>`
		: `<span class="col-empty">–</span>`;

	const hasCommit = !!todo.commit;
	const commitCell = hasCommit
		? `<span class="commit-text" onclick="copyString(this)" title="클릭하여 복사: ${todo.commit}">${todo.commit}</span>`
		: `<span class="col-empty">–</span>`;

	const hasMonth = todo.month !== undefined && todo.month !== null && todo.month !== '';
	const mmCell = hasMonth ? todo.month : '–';

	const hasDetail = !!(todo.detail || todo.commit);
	// 상세보기 버튼은 제목 글자 바로 뒤에 붙여서 보여준다. 실제 클릭 동작은
	// 부모인 .title(has-detail)에 달려 있고, 버튼 클릭도 이벤트 버블링으로 그대로 열린다.
	const detailBtn = hasDetail
		? `<button type="button" class="deploy-file" title="상세 보기"></button>`
		: '';
	const titleAttr = hasDetail ? ' class="title has-detail" onclick="deployView(this)"' : ' class="title"';

	let functionsHTML = '';
	if (isMaster) {
		const endBtn = todo.ended !== true
			? `<button class="end-button" data-id="${todo.id}" title="완료 처리"></button>`
			: '';
		functionsHTML += `
			${endBtn}
			<button class="edit-button" data-id="${todo.id}" title="편집"></button>
			<button class="delete-button" data-id="${todo.id}" title="삭제"></button>
		`;
	}

	return `
		<button type="button" class="flag" title="중요 표시" onclick="toggleFlag(this)"></button>
		<span class="date">${todo.date ?? ''}</span>
		<span${titleAttr}>${todo.title ?? ''}${detailBtn}</span>
		<span class="col-mm${hasMonth ? '' : ' is-empty'}">${mmCell}</span>
		<div class="col-notion">${urlCell}</div>
		<div class="col-commit">${commitCell}</div>
		<p class="functions">${functionsHTML}</p>
		<div class="deploy"><pre>${todo?.detail ?? ''}</pre></div>
	`;
}

// 플래그 버튼: 업무 항목을 눈에 띄게 표시(토글)한다. 서버(config/todos)에는 저장하지
// 않고 localStorage(FLAG_STORAGE_KEY)에만 남겨서, 새로고침/다른 화면 이동 후에도
// renderTodos()가 복원할 수 있게 한다.
function toggleFlag(btn) {
	const li = btn.closest('.li');
	const id = li.getAttribute('id');
	const flagged = li.classList.toggle('flag');

	const ids = getFlaggedIds();
	if (flagged) {
		ids.add(id);
	} else {
		ids.delete(id);
	}
	saveFlaggedIds(ids);
}

function renderTodos(todos) {
	todoList.innerHTML = '';
	if (todos.length === 0) {
		todoList.innerHTML = '<p>No todo found.</p>';
	}
	todos.sort((a, b) => new Date(b.date) - new Date(a.date)); //sort by date

	const isMaster = masterId === activeUser;
	const flaggedIds = getFlaggedIds();

	todos.forEach((todo, index) => {
		const li = document.createElement('li');
		li.dataset.index = index; // 데이터셋에 index 저장 (수정 시 활용)
		li.classList.add('li');
		li.setAttribute('id', todo.id);

		if (todo.deploy && typeof todo.deploy !== 'undefined') {
			todo.detail = todo.deploy;
			delete todo.deploy;
		}
		if (todo.notion && typeof todo.notion !== 'undefined') {
			todo.url = todo.notion;
		}
		if (todo.ended === true) {
			li.classList.add('ended');
		}
		if (flaggedIds.has(todo.id)) {
			li.classList.add('flag');
		}

		li.innerHTML = buildTodoRowHTML(todo, isMaster);

		if (isMaster) {
			const editButton = li.querySelector('.edit-button');
			editButton.addEventListener('click', () => {
				bindEdit(todo);
			});
		}

		todoList.appendChild(li);
	});

	document.getElementById('Ydate').valueAsDate = new Date();
	applyTaskFilters();

	// 항상 켜져 있는 내장 기능(구 ui.js/month.js를 병합). config.plugins와 무관하게 항상 실행된다.
	keywordInit();
	dateColorize();
	markWeekStart();
	if (isMaster) {
		uptodate();
	}
	mMonthInit(todos);

	loadPlugins();
}

// 사용자 추가 플러그인: config.json의 plugins 배열에 assets/ 폴더 안의 스크립트
// 파일명을 적어두면 렌더마다 <script> 태그로 다시 불러와 실행한다(예전 방식 그대로 복원).
// 매번 다시 로드되므로, 플러그인 스크립트는 top-level let/const 대신 var나
// 즉시실행함수(IIFE)로 작성해야 재선언 오류 없이 안전하게 반복 실행된다.
function loadPlugins() {
	fetch('./config.json')
		.then((response) => response.json())
		.then((cfg) => {
			if (cfg && cfg.plugins && Array.isArray(cfg.plugins)) {
				cfg.plugins.forEach((plugin) => {
					const oldScript = document.querySelector(`script[src="./assets/${plugin}"]`);
					if (oldScript) {
						oldScript.remove(); // 기존 script 삭제
					}
					const script = document.createElement('script');
					script.src = `./assets/${plugin}`;
					document.head.appendChild(script);
				});
			}
		})
		.catch((e) => console.error('plugins 로드 실패:', e));
}

function bindEdit(obj) {
	const li = document.getElementById(obj.id);
	tempLi = li.innerHTML;
	tempTodo = obj;
	li.classList.add('edit');
	li.innerHTML = `
			<p class="date-title">
				<input type="date" class="edit-date" value="${obj.date}">
				<input type="text" class="edit-title" value="${obj.title}">
				<input type="number" step="0.0625" class="edit-month" value="${obj?.month ?? ''}" placeholder="퍼블리싱 M/M">
				<input type="text" class="edit-url" value="${obj?.url ?? ''}" placeholder="노션 URL">
				<input type="text" class="edit-commit" value="${obj?.commit ?? ''}" placeholder="커밋 키워드">
				<textarea class="edit-detail" rows="10">${obj?.detail ?? ''}</textarea>
			</p>
			<p class="functions">
				<label class="edit-ended-label">
					<input type="checkbox" class="edit-ended" ${obj.ended ? 'checked' : ''}>
					완료하기
				</label>
				<button class="save-button" onclick="editSave('${obj.id}')">저장</button>
				<button class="cancel-button" onclick="editCancel('${obj.id}')">취소</button>
				<button type="button" class="rollover-button" onclick="rolloverTodo('${obj.id}')">이월</button>
			</p>
		`;
}

// '이월' 버튼: 이번 달에 못 끝낸 업무를 완료 처리("(이월) " 접두어)하고,
// 같은 내용(제목/커밋 키워드)의 새 업무를 다음 달 1일자로 새로 등록한다.
// (노션 URL/M-M은 새 달에 새로 채우는 값이라 비워둔다)
function rolloverTodo(id) {
	const li = document.getElementById(id);
	const index = li.dataset.index;
	const editDate = li.querySelector('.edit-date').value;
	const editTitle = li.querySelector('.edit-title').value;
	const editDetail = li.querySelector('.edit-detail').value;
	const editMonth = li.querySelector('.edit-month').value;
	const editUrl = li.querySelector('.edit-url').value;
	const editCommit = li.querySelector('.edit-commit').value;

	if (!editDate) {
		alert('날짜가 없어 다음 달을 계산할 수 없습니다.');
		return;
	}
	if (!confirm('이 업무를 완료 처리하고, 다음 달 1일에 동일한 업무를 새로 등록할까요?')) {
		return;
	}

	// 1) 원본 업무: 완료 처리 + 제목 앞에 "(이월) " 표시 (이미 이월된 건 중복으로 안 붙임)
	const rolledTitle = editTitle.startsWith('(이월) ') ? editTitle : '(이월) ' + editTitle;
	const rolledObj = {
		id,
		date: editDate,
		title: rolledTitle,
		detail: editDetail,
		ended: true,
		month: editMonth,
		url: editUrl,
		commit: editCommit,
	};
	todos[index] = removeEmptyKeys(rolledObj);

	// 2) 신규 업무: 원본 날짜 기준 "다음 달 1일". new Date(y, m, 1)에서 m은 원본 월(1~12,
	// 1-indexed) 값을 그대로 넣는데, Date 생성자의 month 인자는 0-indexed라 자동으로
	// "다음 달"이 되고, 12월이어도 연도가 자동으로 넘어간다 (UTC 변환 없이 로컬 값만 사용).
	const [y, m] = editDate.split('-').map(Number);
	const nextMonth = new Date(y, m, 1);
	const nextDateStr = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

	const newTodo = {
		id: generateId(),
		date: nextDateStr,
		title: editTitle, // "(이월)" 접두어 없는 원래 제목
		commit: editCommit,
		ended: false,
	};
	todos.unshift(removeEmptyKeys(newTodo));

	countingTodo(todos);
	saveTodos();
	syncMasterAggregate();
	if (typeof mMonthInit !== 'undefined') {
		mMonthInit(todos);
	}
	renderTodos(todos);
}

// Save 버튼 클릭 이벤트
function editSave(id) {
	const li = document.getElementById(id);
	const index = li.dataset.index;
	const editID = li.getAttribute('id');
	const editDate = li.querySelector('.edit-date').value;
	const editTitle = li.querySelector('.edit-title').value;
	const editDetail = li.querySelector('.edit-detail').value;
	const editEnded = li.querySelector('.edit-ended').checked;
	const editMonth = li.querySelector('.edit-month').value;
	const editUrl = li.querySelector('.edit-url').value;
	const editCommit = li.querySelector('.edit-commit').value;

	let newObj = {
		id: editID,
		date: editDate,
		title: editTitle,
		detail: editDetail,
		ended: editEnded,
		month: editMonth,
		url: editUrl,
		commit: editCommit,
	};
	todos[index] = removeEmptyKeys(newObj);

	saveTodos(); // 서버에 저장
	syncMasterAggregate();
	if (typeof mMonthInit !== 'undefined') {
		mMonthInit(todos);
	}
	// renderTodos()가 #todo-list 전체를 새로 그리므로 이 li에 대한 수동 갱신은 불필요
	renderTodos(todos); // 화면 다시 렌더링
}

function editCancel(id) {
	const li = document.getElementById(id);
	li.classList.remove('edit');
	li.innerHTML = tempLi;

	const editButton = li.querySelector('.edit-button');
	editButton.addEventListener('click', function () {
		bindEdit(tempTodo);
	});
}

function saveTodos() {
	// 이번에 저장하려는 값(todos)으로 덮어쓰기 "직전"에, 마지막으로 저장에 성공했던
	// 값을 undo 대상으로 localStorage에 옮겨둔다. (최초 저장 전이라 lastSavedSnapshot이
	// 없으면 되돌릴 이전 상태가 없다는 뜻이므로 건너뛴다)
	if (lastSavedSnapshot !== null) {
		try {
			localStorage.setItem(UNDO_STORAGE_KEY, lastSavedSnapshot);
		} catch (e) {
			console.error('undo 스냅샷 저장 실패:', e);
		}
	}
	lastSavedSnapshot = JSON.stringify(todos);
	saveButton.click();
}

// Ctrl+Z(맥은 Cmd+Z): 확인창을 띄우고, 확인하면 마지막 저장 이전 상태로 되돌린다.
document.addEventListener('keydown', (e) => {
	if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z')) return;

	// 입력 필드(제목/상세/편집 인풋 등)에서는 브라우저 기본 텍스트 되돌리기를 살려둔다.
	const tag = e.target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA') return;

	// master 데이터만 이 앱에서 수정/저장하므로, 다른 팀원 탭을 보고 있을 땐 대상이 없다.
	if (activeUser !== masterId) return;

	e.preventDefault();

	const snapshot = localStorage.getItem(UNDO_STORAGE_KEY);
	if (!snapshot) {
		alert('되돌릴 이전 저장 기록이 없습니다.');
		return;
	}

	if (confirm('바로 직전에 저장된 상태로 되돌릴까요?')) {
		try {
			todos = JSON.parse(snapshot);
		} catch (err) {
			console.error('undo 스냅샷 파싱 실패:', err);
			alert('되돌리기에 실패했습니다. 저장된 데이터가 손상되었습니다.');
			return;
		}
		countingTodo(todos);
		renderTodos(todos);
		saveTodos();
	}
});
function removeEmptyKeys(obj) {
	for (let key in obj) {
		if (obj.hasOwnProperty(key)) {
			if (obj[key] === '' || obj[key] === null) {
				delete obj[key];
			}
		}
	}
	return obj;
}
addButton.addEventListener('click', () => {
	const newTodo = {
		id: generateId(),
		title: todoTitle.value,
		detail: todoDetail.value,
		date: todoDate.value,
		url: todoUrl.value,
		commit: todoCommit.value,
		month: todoMonth.value,
		ended: false, // 완료 여부 (기본값: false)
	};
	if (!newTodo.title) {
		alert('제목을 입력해 주세요');
		return;
	}
	if (!newTodo.date) {
		alert('날짜가 없습니다. 리스트 맨 하단에 추가됩니다.');
	}
	const newTodoNEW = removeEmptyKeys(newTodo);
	todos.unshift(newTodoNEW);
	countingTodo(todos)
	renderTodos(todos);
	saveTodos();
	syncMasterAggregate();
	todoTitle.value = '';
	todoDetail.value = '';
	todoUrl.value = '';
	todoCommit.value = '';
	todoMonth.value = '';
});

todoList.addEventListener('click', (event) => {
	if (event.target.classList.contains('delete-button')) {
		var result = confirm('Want to delete?');
		if (result) {
			const id = event.target.dataset.id;
			todos = todos.filter((todo) => todo.id !== id);

			const index = document.getElementById(id).dataset.index;
			const liToRemove = document.querySelector(`li[data-index="${index}"]`);
			if (liToRemove) {
				liToRemove.remove();
			}
			updateIndexes(); // 삭제 후 남은 `li`들의 data-index 업데이트

			// 삭제된 업무의 플래그 기록도 localStorage에서 함께 정리
			const flaggedIds = getFlaggedIds();
			if (flaggedIds.delete(id)) {
				saveFlaggedIds(flaggedIds);
			}
			saveTodos();
			syncMasterAggregate();
			if (typeof mMonthInit !== 'undefined') {
				mMonthInit(todos);
			}
			countingTodo(todos)
		}
	}
});

function updateIndexes() {
	const listItems = document.querySelectorAll('.li');
	listItems.forEach((li, newIndex) => {
		li.setAttribute('data-index', newIndex);
	}); // localStorage의 todos 배열도 인덱스 업데이트
	//----------------- let todos = JSON.parse(localStorage.getItem('todos')) || [];
	//------------------ localStorage.setItem('todos', JSON.stringify(todos));
}

todoList.addEventListener('click', (event) => {
	if (event.target.classList.contains('end-button')) {
		var result = confirm('Want to Finish?');
		if (result) {
			const id = event.target.dataset.id;
			const todo = todos.find((todo) => todo.id === id);
			if (todo) {
				todo.ended = true;
				console.log(`ID: ${id} 완료 처리됨`, todo);
			}
			saveTodos();
			syncMasterAggregate();
			// updateIndexes();
			renderTodos(todos);
		}
	}
});

loadButton.addEventListener('click', () => {
	fileInput.click();
});
fileInput.addEventListener('change', (event) => {
	const file = event.target.files[0];
	const reader = new FileReader();
	reader.onload = (e) => {
		try {
			const loadedTodos = JSON.parse(e.target.result);
			todos = loadedTodos;
			saveTodos();
			syncMasterAggregate();
			renderTodos(todos);
		} catch (error) {
			console.error('Error loading JSON file:', error);
			alert('Invalid JSON file.');
		}
	};
	reader.readAsText(file);
});
saveButton.addEventListener('click', (e) => {
	todos.sort((a, b) => new Date(b.date) - new Date(a.date)); //sort by date
	fetch('/save', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ todos }),
	})
		.then((response) => response.json())
		.then((data) => {
			console.log('Todos saved:', data);
			checkMotion(e);
		});
});

// UI
function checkMotion(event) {
	const button = event.target;
	let check = document.getElementById('save-check');
	if (check === null) {
		check = document.createElement('i');
		check.id = 'save-check';
		button.appendChild(check);
		void check.offsetWidth;
		check.classList.add('motion');
	} else {
		check.remove();
	}
}

// 버튼 내 로딩
function fnLoadingInButton(obj) {
	let target;
	if (!obj) { return; }
	if (obj instanceof HTMLElement) {
		target = obj;
	} else if (typeof obj === 'string') {
		target = document.querySelector(obj);
	}
	const html = `<span class="loading-in-button"><span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
	target.insertAdjacentHTML('beforeend', html);
}

const findDetail = document.getElementById('find_string');
findDetail.addEventListener('click', function () {
	var query = document.getElementById('find_file_string').value;
	findFiles(query);
});

function loadingInit() {
	const l = document.getElementById('loading');
	if (l === null) {
		const l = document.createElement('div');
		l.classList.add('loading');
		document.body.appendChild(l);
	}
}
function loadingRemove() {
	const l = document.querySelector('.loading');
	if (l !== null) {
		l.remove();
	}
}

function findFiles(string) {
	var find = string;
	var result = [];
	todos.forEach(function (item) {
		if (item.detail?.indexOf(find) > -1) {
			result.push(item.id);
		}
	});
	if (result.length > 0) {
		var li = document.querySelectorAll('.li');
		li.forEach(function (item) {
			if (result.indexOf(item.id) > -1) {
				const deployElement = item.querySelector('.deploy');
				deployElement.style.display = 'block';
				if (deployElement) {
					deployElement.innerHTML = deployElement.innerHTML.replace(string, `<span class="key-string">${string}</span>`);
				}
			} else {
				item.style.display = 'none';
			}
		});
	} else {
		alert('Can not find "' + string + '"');
	}
}

async function fetchNotionFiles(userId) {
  try {
    const res = await fetch(`/todos/${encodeURIComponent(userId)}`, {
      method: 'GET',
    });

    if (!res.ok) {
      alert(`로드 실패: ${res.status}`);
      return null;
    }

    const data = await res.json();
    // data 형태: { user: '20202222', todos: [ {...}, {...} ] }

    return data;
  } catch (err) {
    console.error(err);
    alert('네트워크 오류 (GET)');
    return null;
  }
}


async function updateNotionFile(userId, todos) {
  try {
    const res = await fetch(`/todos/${encodeURIComponent(userId)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ todos }),
    });

    if (!res.ok) {
      // 서버가 내려주는 실제 실패 사유(Notion 쪽 에러 메시지 등)를 그대로 보여준다.
      // 이게 뜨면 Notion에 실제로 반영이 안 된 것이므로, Sync 화면에 "업로드 기록 없음"이
      // 뜨는 것도 정상 — 마지막 업로드가 실제로 성공한 적이 없다는 뜻이다.
      let details = '';
      try {
        const errBody = await res.json();
        details = errBody?.details ? `\n${errBody.details}` : '';
      } catch (e) {}
      alert(`저장 실패: ${res.status}${details}`);
      return false;
    }

    const data = await res.json();
    console.log('update result:', data);
    return true;
  } catch (err) {
    console.error(err);
    alert('네트워크 오류 (PUT)');
    return false;
  }
}

document.getElementById('copy-button').addEventListener('click', async (e) => {
	try {
		const fileName = `${activeUser}.json`; // 파일명
		const fileContent = JSON.stringify(todos, null, 2); // 파일 내용

		// 클립보드에 파일 내용 복사
		await navigator.clipboard.writeText(fileContent);
		checkMotion(e);
	} catch (error) {
		console.error('Error copying file content to clipboard:', error);
	}
});

function formatDateYYYYMMDD(d) {
	const yyyy = d.getFullYear();
	const mm = String(d.getMonth() + 1).padStart(2, '0');
	const dd = String(d.getDate()).padStart(2, '0');
	return `${yyyy}${mm}${dd}`;
}

function formatTimeHHMM(d) {
	const hh = String(d.getHours()).padStart(2, '0');
	const mm = String(d.getMinutes()).padStart(2, '0');
	return `${hh}:${mm}`;
}

// 설정 화면의 "JSON 다운로드" 버튼: 실제 파일로 다운로드한다.
// (#save-button 은 saveTodos()가 내부적으로 서버에 자동 저장할 때만 쓰는 숨김 버튼이라 별도로 둔다)
const downloadButton = document.getElementById('download-button');
if (downloadButton) {
	downloadButton.addEventListener('click', (e) => {
		const dateStr = formatDateYYYYMMDD(new Date());
		const fileName = `${activeUser}_${dateStr}.json`;
		const blob = new Blob([JSON.stringify(todos, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = fileName;
		document.body.appendChild(a);
		a.click();
		a.remove();
		URL.revokeObjectURL(url);
		checkMotion(e);
	});
}

// document.getElementById('upload-button').addEventListener('click', async () => {
document.documentElement.addEventListener('click', async (event) => {
	// 버튼 안의 <span> 텍스트를 클릭하면 event.target이 span이 되어
	// classList.contains('upload-button')이 false가 되던 문제를 closest()로 수정
	const uploadTarget = event.target.closest('.upload-button');
	if (uploadTarget) {
		// try {
		fnLoadingInButton(uploadTarget);

		let uploadTodo = todos;
		if(uploadLastDay > 0){
			uploadTodo = getRecentTodos(todos, uploadLastDay);
		}

		const charLen = JSON.stringify({ uploadTodo }).length;
		console.log('json 글자 수가 '+ charLen + ' 입니다.');
		const info = document.querySelector('#last-upload-info');
		info.innerHTML = '(업로드 된 문자 수: '+ charLen +')';

		if(charLen > 20000) {
			alert('json 글자 수가 '+ charLen + ' 입니다. config에서 "uploadLastDay" 값을 변경해 주세요. 일단 오늘은 올려드리겠습니다.')
		}
		const ok = await updateNotionFile(masterId, uploadTodo);
		console.log(ok);
		document.querySelector('.loading-in-button').remove();
		checkMotion(event);
		if (ok) {
			lastSyncAt = new Date();
			info.innerHTML = '(문자 수: '+ charLen +' · '+ formatTimeHHMM(lastSyncAt) +' 업로드됨)';
			document.dispatchEvent(new CustomEvent('todos:uploaded'));
		}

		// } catch (error) {
		// 	document.getElementById('result').textContent = `오류: ${error.message}`;
		// }
	}
});

function getRecentTodos(todoJson, day) {
  const today = new Date();
  today.setHours(0, 0, 0, 0); // 시간 제거 (날짜만 비교)

  // today 기준 day일 전 날짜 계산
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - day);

  // today 기준 30일 후 날짜 (상한)
  const endDate = new Date(today);
  endDate.setDate(endDate.getDate() + 30);

  return todoJson.filter(todo => {
    const todoDate = new Date(todo.date);
    todoDate.setHours(0, 0, 0, 0); // 시간 제거

    // startDate 이후의 모든 날짜를 포함 (과거 day일 + 오늘 + 미래)
    return todoDate >= startDate && todoDate < endDate;;
  });
}

/* =========================================================================
   ERP 콘솔 셸: 뷰 라우팅 / 상단바 / 팀·동기화·리포트 뷰 / 설정 컨트롤
   기존 todos/masterId/activeUser/users 전역 변수와 saveTodos/renderTodos/
   fetchNotionFiles/updateNotionFile/checkMotion/fnLoadingInButton 등
   기존 함수를 그대로 재사용한다 (script.js 상단 로직은 수정하지 않음).
   ========================================================================= */

let allUsersTodos = {};
let allUsersLoadedOnce = false;
let lastSyncAt = null;

// master 는 로컬 data/{id}.json, 그 외는 Notion API 에서 읽어온다 (loadTodoData와 동일한 규칙).
// 백그라운드 집계용이므로 fetchNotionFiles와 달리 실패해도 alert 없이 조용히 빈 배열을 반환한다.
async function fetchUserTodosRaw(userId) {
	try {
		if (userId === masterId) {
			const res = await fetch(`./data/${userId}.json`);
			if (!res.ok) return [];
			return await res.json();
		}
		const res = await fetch(`/todos/${encodeURIComponent(userId)}`);
		if (!res.ok) return [];
		const data = await res.json();
		return (data && data.todos) || [];
	} catch (e) {
		console.error('fetchUserTodosRaw error:', userId, e);
		return [];
	}
}

async function loadAllUsersTodos(force) {
	if (allUsersLoadedOnce && !force) return allUsersTodos;
	const activeUsers = (users || []).filter((u) => u.active);
	const entries = await Promise.all(
		activeUsers.map(async (u) => [u.id, await fetchUserTodosRaw(u.id)])
	);
	allUsersTodos = Object.fromEntries(entries);
	allUsersLoadedOnce = true;
	return allUsersTodos;
}

// master 본인 데이터가 로컬에서 바뀔 때(추가/수정/삭제/완료/불러오기)마다
// 팀 현황 캐시를 다시 fetch하지 않고 그 자리에서 갱신한다
function syncMasterAggregate() {
	if (masterId) {
		allUsersTodos[masterId] = todos;
	}
	renderTeamStatusCard();
}

function memberColor(user) {
	return user.id === masterId ? 'var(--point-2)' : '#8b93a5';
}

function currentMonthKey() {
	const d = new Date();
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function monthKeyOf(dateStr) {
	const d = new Date(dateStr);
	if (isNaN(d)) return null;
	return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

// "YYYY-MM" -> "YY.MM" (연도가 바뀌어도 같은 달 숫자가 겹쳐 보이지 않도록 연도를 함께 표시)
function formatMonthLabel(monthKey) {
	return monthKey.slice(2).replace('-', '.');
}

// 오늘 기준 "YYYY-MM" 키를 과거 → 최근 순으로 n개 생성 (이번 달 포함).
// 데이터에 미래 날짜가 섞여 있어도 항상 오늘을 기준으로 한 고정된 달 목록을 쓰기 위함.
function getLastNMonthKeys(n) {
	const now = new Date();
	const keys = [];
	for (let i = n - 1; i >= 0; i--) {
		const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
		keys.push(d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'));
	}
	return keys;
}

function sumMonthValue(list, monthKey) {
	return list
		.filter((t) => t.month && monthKeyOf(t.date) === monthKey)
		.reduce((sum, t) => sum + (parseFloat(t.month) || 0), 0);
}

// 제목의 [키워드, 키워드] 표기에서 키워드 배열 추출 (ui.js의 keywordInit과 동일한 규칙)
function extractKeywords(title) {
	const out = [];
	if (!title) return out;
	const matches = title.match(/\[([^\]]*)\]/g) || [];
	matches.forEach((m) => {
		m.slice(1, -1).split(',').forEach((k) => {
			const key = k.trim();
			if (key) out.push(key);
		});
	});
	return out;
}

function timeAgo(date) {
	const sec = Math.max(1, Math.round((Date.now() - date.getTime()) / 1000));
	if (sec < 60) return `${sec}초 전`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min}분 전`;
	const hr = Math.round(min / 60);
	return `${hr}시간 전`;
}

/* ---------------------- 뷰 라우팅 (Task/Team/Sync/Reports/설정) ---------------------- */
function initViewRouting() {
	const rail = document.getElementById('rail');
	if (!rail) return;
	rail.addEventListener('click', (e) => {
		const btn = e.target.closest('.rail-item');
		if (!btn) return;
		switchView(btn.dataset.view);
	});
	switchView('task');
}

function switchView(view) {
	document.querySelectorAll('.rail-item').forEach((b) => {
		b.classList.toggle('active', b.dataset.view === view);
	});
	document.querySelectorAll('.view[data-view-panel]').forEach((sec) => {
		sec.hidden = sec.dataset.viewPanel !== view;
	});
	if (view === 'team') renderTeamView();
	if (view === 'sync') renderSyncView();
	if (view === 'reports') renderReportsView();
}

/* ---------------------- 상단바 (아바타 / 연동 상태 점 / 검색) ---------------------- */
async function initTopbarChrome() {
	const avatar = document.getElementById('topbar-avatar');
	const status = document.getElementById('topbar-status');
	const search = document.getElementById('topbar-search');

	const masterUser = (users || []).find((u) => u.id === masterId);
	if (avatar && masterUser) {
		avatar.textContent = masterUser.name.charAt(0);
	}

	try {
		const cfg = await (await fetch('./config.json')).json();
		const connected = !!(cfg.notionID && cfg.notionAPI);
		if (status) {
			status.classList.toggle('connected', connected);
			status.classList.toggle('disconnected', !connected);
			status.title = connected ? 'Notion 연동됨' : 'Notion 연동 안됨 (config.json 확인 필요)';
		}
	} catch (e) {
		console.error('topbar status check failed:', e);
	}

	if (search) {
		search.addEventListener('input', applyTaskFilters);
	}

	initTaskStatusFilters();

	document.addEventListener('todos:uploaded', () => {
		if (document.getElementById('view-sync') && !document.getElementById('view-sync').hidden) {
			renderSyncView();
		}
	});
}

/* ---------------------- 업무 리스트: 전체/진행중/완료 필터 + 검색 ---------------------- */
let taskStatusFilter = 'all'; // 'all' | 'active' | 'done'

function initTaskStatusFilters() {
	const wrap = document.getElementById('task-status-filters');
	if (!wrap) return;
	wrap.addEventListener('click', (e) => {
		const btn = e.target.closest('button[data-status-filter]');
		if (!btn) return;
		taskStatusFilter = btn.dataset.statusFilter;
		wrap.querySelectorAll('button[data-status-filter]').forEach((b) => {
			b.classList.toggle('chip-active', b === btn);
		});
		applyTaskFilters();
	});
}

// 상태 필터(전체/진행중/완료) + 상단 검색어를 함께 적용한다.
// renderTodos()가 목록을 새로 그릴 때마다 다시 호출되어야 필터 상태가 유지된다.
function applyTaskFilters() {
	const search = document.getElementById('topbar-search');
	const query = (search ? search.value : '').trim().toLowerCase();
	document.querySelectorAll('#todo-list .li').forEach((li) => {
		const matchesStatus =
			taskStatusFilter === 'done' ? li.classList.contains('ended') :
			taskStatusFilter === 'active' ? !li.classList.contains('ended') :
			true;
		let matchesQuery = true;
		if (query) {
			const text = (li.querySelector('.title')?.textContent || '').toLowerCase();
			const detail = (li.querySelector('.deploy')?.textContent || '').toLowerCase();
			matchesQuery = text.includes(query) || detail.includes(query);
		}
		li.style.display = (matchesStatus && matchesQuery) ? '' : 'none';
	});
}

/* ---------------------- Task 뷰 사이드바: 팀 현황 카드 ---------------------- */
async function renderTeamStatusCard() {
	const body = document.getElementById('team-status-body');
	if (!body) return;
	if (!allUsersLoadedOnce) {
		body.innerHTML = '<p class="muted-note">불러오는 중…</p>';
	}
	const map = await loadAllUsersTodos();
	body.innerHTML = '';
	(users || []).filter((u) => u.active).forEach((u) => {
		const list = map[u.id] || [];
		const openCount = list.filter((t) => !t.ended).length;
		const row = document.createElement('div');
		row.className = 'member-row';
		row.innerHTML = `
			<div class="member-avatar" style="background:${memberColor(u)}">${u.name.charAt(0)}</div>
			<div class="member-name">${u.name}${u.id === masterId ? ' <span class="member-role">· master</span>' : ''}</div>
			<div class="member-count">${openCount}건</div>
		`;
		body.appendChild(row);
	});
}

/* ---------------------- Team 뷰 ---------------------- */
async function renderTeamView() {
	const summaryEl = document.getElementById('team-summary');
	const gridEl = document.getElementById('team-grid');
	const descEl = document.getElementById('team-department-desc');
	if (!summaryEl || !gridEl) return;
	gridEl.innerHTML = '<p class="muted-note">불러오는 중…</p>';

	const activeUsers = (users || []).filter((u) => u.active);
	const dept = activeUsers[0] && activeUsers[0].department;
	if (descEl && dept) descEl.textContent = `${dept} 소속 팀원과 업무 현황입니다.`;

	const map = await loadAllUsersTodos();
	const monthKey = currentMonthKey();

	let totalMM = 0;
	const perUser = activeUsers.map((u) => {
		const list = map[u.id] || [];
		const openCount = list.filter((t) => !t.ended).length;
		const mm = sumMonthValue(list, monthKey);
		totalMM += mm;
		return { user: u, openCount, mm };
	});

	summaryEl.innerHTML = `
		<div class="stat-card"><div class="stat-label">전체 팀원</div><div class="stat-value">${activeUsers.length}</div></div>
		<div class="stat-card"><div class="stat-label">활성 인원</div><div class="stat-value success">${activeUsers.length}</div></div>
		<div class="stat-card"><div class="stat-label">이번 달 총 M/M</div><div class="stat-value accent">${totalMM.toFixed(2)}</div></div>
	`;

	gridEl.innerHTML = '';
	perUser.forEach(({ user, openCount, mm }) => {
		const card = document.createElement('div');
		card.className = 'member-card';
		card.innerHTML = `
			<div class="member-card-head">
				<div class="member-card-avatar" style="background:${memberColor(user)}">${user.name.charAt(0)}</div>
				<div class="member-card-info">
					<div class="member-card-name">${user.name}</div>
					<div class="member-card-meta">${user.department || ''}${user.role ? ' · ' + user.role : ''}</div>
				</div>
				<div class="member-card-dot${user.active ? '' : ' inactive'}"></div>
			</div>
			<div class="member-card-stats">
				<div><div class="member-card-stat-label">진행중 업무</div><div class="member-card-stat-value">${openCount}건</div></div>
				<div><div class="member-card-stat-label">이번 달 M/M</div><div class="member-card-stat-value accent">${mm.toFixed(2)}</div></div>
			</div>
		`;
		gridEl.appendChild(card);
	});
}

/* ---------------------- Notion Sync 뷰 ---------------------- */
// 유저별 "마지막 업로드 시각"은 서버(data/sync-meta.json)에 영속 저장되어 있어
// 페이지를 새로고침하거나 다시 접속해도 남아있다. (이전엔 메모리 변수 lastSyncAt만
// 썼는데, 그 값은 새로고침하면 사라져서 항상 "기록 없음"으로 보이는 문제가 있었다)
async function fetchSyncMeta() {
	try {
		return await (await fetch('/sync-meta')).json();
	} catch (e) {
		console.error('sync-meta load failed:', e);
		return {};
	}
}

// Notion이 실제로 관리하는 페이지별 마지막 수정 시각. sync-meta(이 서버를 통해
// 업로드했을 때만 기록됨, master만 해당)와 달리 팀원이 어떤 경로로 Notion 값을
// 갱신했든 정확히 반영되므로 이걸 우선 사용한다.
async function fetchNotionStatus() {
	try {
		const res = await fetch('/notion-status');
		if (!res.ok) return {};
		return await res.json();
	} catch (e) {
		console.error('notion-status load failed:', e);
		return {};
	}
}

async function renderSyncView() {
	const statusCard = document.getElementById('sync-status-card');
	const userList = document.getElementById('sync-user-list');
	const connInfo = document.getElementById('sync-connection-info');
	if (!statusCard || !userList || !connInfo) return;

	let cfg = {};
	try {
		cfg = await (await fetch('./config.json')).json();
	} catch (e) {
		console.error('config load failed:', e);
	}
	const connected = !!(cfg.notionID && cfg.notionAPI);
	const deptLabel = users && users[0] && users[0].department;
	// Notion의 last_edited_time을 우선 소스로 쓰고, 이 서버를 통한 업로드 기록
	// (sync-meta, master만 존재)은 둘 다 있을 때 더 최신 쪽을 고르는 보조 수단으로 쓴다.
	const [syncMeta, notionStatus] = await Promise.all([fetchSyncMeta(), fetchNotionStatus()]);
	function resolveLastUpload(userId) {
		const fromNotion = notionStatus[userId] ? new Date(notionStatus[userId]) : null;
		const fromLocal = syncMeta[userId] ? new Date(syncMeta[userId]) : null;
		if (fromNotion && fromLocal) return fromNotion > fromLocal ? fromNotion : fromLocal;
		return fromNotion || fromLocal;
	}
	const masterLastUpload = resolveLastUpload(masterId);

	statusCard.classList.toggle('disconnected', !connected);
	statusCard.innerHTML = `
		<div class="sync-status-icon"><i></i></div>
		<div class="sync-status-info">
			<div class="sync-status-title">${connected ? '연결됨' + (deptLabel ? ' · ' + deptLabel + ' 업무 데이터베이스' : '') : '연결 안됨'}</div>
			<div class="sync-status-sub">${masterLastUpload ? '마지막 업로드 · ' + timeAgo(masterLastUpload) : '업로드 기록이 없습니다'}</div>
		</div>
		<button type="button" class="sync-status-action" id="sync-now-button" ${connected ? '' : 'disabled'}>새로고침</button>
	`;
	const syncBtn = document.getElementById('sync-now-button');
	if (syncBtn) {
		syncBtn.addEventListener('click', async () => {
			// Notion으로 업로드(push)하지 않는다 — 팀원별 현황을 다시 불러오기만 한다.
			// 업로드는 topbar의 "Upload JSON" 버튼으로만 한다.
			await loadAllUsersTodos(true);
			renderSyncView();
		});
	}

	const map = await loadAllUsersTodos();
	userList.innerHTML = '';
	(users || []).filter((u) => u.active).forEach((u) => {
		const list = map[u.id] || [];
		const lastUpload = resolveLastUpload(u.id);
		const row = document.createElement('div');
		row.className = 'sync-user-row';
		row.innerHTML = `
			<div class="member-avatar" style="background:${memberColor(u)}">${u.name.charAt(0)}</div>
			<div class="sync-user-name">${u.name}</div>
			<div class="sync-user-time">${lastUpload ? '마지막 업로드 · ' + timeAgo(lastUpload) : '업로드 기록 없음'}</div>
			<div class="sync-user-count">${list.length}건</div>
		`;
		userList.appendChild(row);
	});

	function mask(v) {
		if (!v) return '미설정';
		return v.length > 4 ? '••••' + v.slice(-4) : '••••';
	}
	connInfo.innerHTML = `
		<div class="conn-row"><span>Database ID</span><span>${mask(cfg.notionID)}</span></div>
		<div class="conn-row"><span>API Key</span><span>${mask(cfg.notionAPI)}</span></div>
		<div class="conn-note">연결 정보 변경은 config.json 에서 할 수 있습니다.</div>
	`;
}

/* ---------------------- Reports 뷰 ---------------------- */
async function renderReportsView() {
	const countChartEl = document.getElementById('report-count-chart');
	const mmTrendEl = document.getElementById('report-mm-trend');
	const keywordsEl = document.getElementById('report-keywords');
	const memberMMEl = document.getElementById('report-member-mm');
	if (!countChartEl || !mmTrendEl || !keywordsEl || !memberMMEl) return;

	const map = await loadAllUsersTodos();
	const allTodos = Object.values(map).flat();

	// 월별 집계
	const byMonth = {};
	allTodos.forEach((t) => {
		const key = monthKeyOf(t.date);
		if (!key) return;
		if (!byMonth[key]) byMonth[key] = { count: 0, mm: 0 };
		byMonth[key].count += 1;
		byMonth[key].mm += parseFloat(t.month) || 0;
	});
	// "데이터가 있는 달 중 정렬 후 마지막 6개"로 뽑으면, todo에 미래 날짜(예정 업무)가
	// 섞여 있을 때 오늘과 무관하게 가장 미래 쪽 6개 달이 뽑혀서 듬성듬성하고 뒤죽박죽인
	// 것처럼 보이는 문제가 있었다 (예: 26.12, 27.01, 27.05, 27.10, 28.01 …).
	// "최근 6개월"은 오늘 날짜 기준으로 항상 고정된 달(이번 달 포함 과거 5개월)이어야
	// 하므로, 데이터 유무와 상관없이 달 목록을 직접 계산한다.
	const months = getLastNMonthKeys(6);
	const totalCount = months.reduce((sum, m) => sum + (byMonth[m]?.count || 0), 0);

	if (totalCount === 0) {
		countChartEl.innerHTML = '<p class="muted-note">데이터가 없습니다.</p>';
		mmTrendEl.innerHTML = '<p class="muted-note">데이터가 없습니다.</p>';
	} else {
		countChartEl.innerHTML = '';
		const maxCount = Math.max(1, ...months.map((m) => byMonth[m]?.count || 0));
		months.forEach((m) => {
			const count = byMonth[m]?.count || 0;
			const col = document.createElement('div');
			col.className = 'bar-col' + (count === maxCount && count > 0 ? ' bar-max' : '');
			const heightPx = count === 0 ? 0 : Math.max(6, Math.round((count / maxCount) * 100));
			col.innerHTML = `<div class="bar" style="height:${heightPx}px" title="${count}건"></div><div class="bar-label">${formatMonthLabel(m)}</div>`;
			countChartEl.appendChild(col);
		});

		// 위 막대그래프와 같은 시간순(과거 → 최근)으로 정렬해서 두 패널의 순서가 다르게
		// 보이지 않도록 한다 (기존엔 여기만 reverse()로 최근순이라 서로 뒤죽박죽으로 보였음).
		mmTrendEl.innerHTML = '';
		const maxMM = Math.max(0.01, ...months.map((m) => byMonth[m]?.mm || 0));
		months.forEach((m) => {
			const mm = byMonth[m]?.mm || 0;
			const pct = mm === 0 ? 0 : Math.max(2, Math.round((mm / maxMM) * 100));
			const row = document.createElement('div');
			row.className = 'hbar-row';
			row.innerHTML = `<div class="hbar-label">${formatMonthLabel(m)}</div><div class="hbar-track"><div class="hbar-fill" style="width:${pct}%"></div></div><div class="hbar-value">${mm.toFixed(2)}</div>`;
			mmTrendEl.appendChild(row);
		});
	}

	// 키워드 분포 (전체 팀)
	const keywordCounts = {};
	allTodos.forEach((t) => {
		extractKeywords(t.title).forEach((k) => {
			keywordCounts[k] = (keywordCounts[k] || 0) + 1;
		});
	});
	const sortedKeywords = Object.entries(keywordCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
	keywordsEl.innerHTML = sortedKeywords.length
		? sortedKeywords.map(([k, c], i) => `<span class="chip${i === 0 ? ' chip-top' : ''}">${k} · ${c}</span>`).join('')
		: '<p class="muted-note">키워드가 없습니다.</p>';

	// 팀원별 M/M (이번 달)
	const monthKey = currentMonthKey();
	const perUser = (users || []).filter((u) => u.active).map((u) => ({
		user: u,
		mm: sumMonthValue(map[u.id] || [], monthKey),
	})).sort((a, b) => b.mm - a.mm);
	const maxUserMM = Math.max(0.01, ...perUser.map((p) => p.mm));
	memberMMEl.innerHTML = perUser.length
		? perUser.map(({ user, mm }) => `
			<div class="hbar-row">
				<div class="hbar-label">${user.name}</div>
				<div class="hbar-track"><div class="hbar-fill" style="width:${Math.max(2, Math.round((mm / maxUserMM) * 100))}%"></div></div>
				<div class="hbar-value">${mm.toFixed(2)}</div>
			</div>
		`).join('')
		: '<p class="muted-note">데이터가 없습니다.</p>';
}

/* ---------------------- 설정: 표시 행수 세그먼트 컨트롤 ---------------------- */
function initLimitSegmented() {
	const wrap = document.getElementById('limit-segmented');
	if (!wrap) return;
	const syncActive = () => {
		const current = limit === Infinity ? 'all' : String(limit);
		wrap.querySelectorAll('button').forEach((b) => {
			b.classList.toggle('active', b.dataset.limit === current);
		});
	};
	syncActive();
	wrap.addEventListener('click', async (e) => {
		const btn = e.target.closest('button[data-limit]');
		if (!btn) return;
		const raw = btn.dataset.limit;
		const value = raw === 'all' ? 'all' : parseInt(raw, 10);
		try {
			await fetch('/config/limit', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ limit: value }),
			});
		} catch (err) {
			console.error('limit update failed:', err);
		}
		limit = value === 'all' ? Infinity : value;
		syncActive();
		renderTodos(todos.slice(0, limit));
	});
}

/* ---------------------- 설정: 테마 그리드 (5개 큐레이션 옵션) ---------------------- */
const CURATED_THEMES = [
	{ file: '', label: 'Light · 기본', swatch: '#ffffff', swatchBorder: '#d7dbe3' },
	{ file: 'dark.css', label: 'Dark', swatch: '#20242c' },
	{ file: 'mono.css', label: 'Mono', swatch: '#e4e4e4', swatchBorder: '#cfcfcf' },
	{ file: 'note.css', label: 'Note', swatch: '#fbf5e9', swatchBorder: '#ecdfc4' },
	{ file: 'notion.css', label: 'Notion', swatch: '#2f2f2f' },
];

function initThemeGrid() {
	const grid = document.getElementById('theme-grid');
	if (!grid || grid.dataset.bound) {
		if (grid) renderThemeGridOptions(grid);
		return;
	}
	grid.dataset.bound = '1';
	renderThemeGridOptions(grid);
	grid.addEventListener('click', (e) => {
		const btn = e.target.closest('.theme-option');
		if (!btn || !themeSelect) return;
		const file = btn.dataset.theme;
		if (themeSelect.value === file) return;
		themeSelect.value = file;
		themeSelect.dispatchEvent(new Event('change'));
	});
}

function renderThemeGridOptions(grid) {
	const current = themeSelect ? themeSelect.value : '';
	grid.innerHTML = CURATED_THEMES.map((t) => `
		<button type="button" class="theme-option${t.file === current ? ' active' : ''}" data-theme="${t.file}">
			<span class="theme-swatch" style="background:${t.swatch};${t.swatchBorder ? 'border-color:' + t.swatchBorder : ''}"></span>
			<span class="theme-option-label">${t.label}</span>
		</button>
	`).join('');
}

/* =========================================================================
   내장 기능 (구 plugins): 예전엔 config.json의 plugins 배열로 매 렌더마다
   ui.js / month.js / time-alert.js를 <script> 태그로 다시 불러왔다.
   (반복 로드 시 top-level let 재선언 오류가 나는 등 불안정해서) 이제는
   항상 켜져 있는 내장 기능으로 병합한다. reload-everyday.js는 제거했다.
   ========================================================================= */

// ---- ui.js 병합: 키워드 태그 / 날짜 색상 / 주 구분선 / 상세보기 모달 / 다음날짜 이동 ----

function uptodate() {
	const li = document.querySelectorAll('#todo-list .li');
	li.forEach((item) => {
		const upBtn = `<div class="fn-update"><button title="다음 날짜로 이동"></button></div>`;
		item.insertAdjacentHTML('beforeend', upBtn);
		const btn = item.querySelector('.fn-update button');
		btn.addEventListener('click', function () {
			const thisID = item.getAttribute('id');
			const today = item.querySelector('.date').innerHTML;
			const nextday = new Date(today);
			nextday.setUTCDate(nextday.getUTCDate() + 1);
			const next = nextday.toISOString().substr(0, 10);
			todos.map(function (a) {
				if (a.id == thisID) {
					a.date = next;
				}
			});
			saveTodos();
			renderTodos(todos);
		});
	});
}

function dateColorize() {
	let dateArr = []; // [-3day, -2day, yesterday, today, tomorrow, +2day, +3day]
	const dateCalc = 86400000;
	let dateSets_i = -3;
	while (dateSets_i < 4) {
		var yyyy, dd, mm;
		var dateTemp = new Date(new Date().getTime() + dateCalc * dateSets_i);
		yyyy = dateTemp.getFullYear();
		mm = dateTemp.getMonth() + 1;
		dd = dateTemp.getDate();
		mm < 10 ? (mm = '0' + mm) : (mm = mm);
		dd < 10 ? (dd = '0' + dd) : (dd = dd);
		dateArr.push(yyyy + '-' + mm + '-' + dd);
		dateSets_i++;
	}

	document.querySelectorAll('#todo-list .li').forEach((that) => {
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

function keywordInit() {
	const lists = document.querySelectorAll('#todo-list .li');
	let keywords = [];
	lists.forEach((that) => {
		let title = that.querySelector('span.title');
		if (title.innerHTML.indexOf('[') > -1 && title.innerHTML.indexOf(']') > -1) {
			var keywordOrigin = title.innerHTML.match(/\[.*\]/gi);
			keywordOrigin += '';
			var keyword = keywordOrigin.split('[').join('');
			keyword = keyword.split(']').join('');
			if (keyword.indexOf(',') > -1) {
				keyword = keyword.replace(/\s/g, '');
				var keys = keyword.split(',');
				keywords = keywords.concat(keys);
				keywords = keywords.filter((item, pos) => keywords.indexOf(item) === pos);
			} else if (keywords.indexOf(keyword) === -1) {
				keywords.push(keyword);
			}
			for (var n = 0; n < keywords.length; n++) {
				if (keywordOrigin.indexOf(keywords[n]) > -1) {
					that.classList.add('key-' + n);
				}
			}
		}
	});

	const keyWrap = document.getElementById('keywords');
	if (keyWrap) {
		keyWrap.innerHTML = '';
	}
	for (var j = 0; j < keywords.length; j++) {
		const keys = document.getElementById('keywords');
		const tag = '<a href="javascript:void(0)" class="keyword" key_value="key-' + j + '">' + keywords[j] + '</a>';
		keys.insertAdjacentHTML('beforeend', tag);
	}

	document.querySelectorAll(`a[key_value*="key-"]`).forEach((i) => {
		i.addEventListener('click', function () {
			const keyclass = this.getAttribute('key_value');
			const tagLi = document.querySelectorAll('.li.' + keyclass);
			if (this.classList.contains('active')) {
				this.classList.remove('active');
				tagLi.forEach((item) => item.classList.remove('list-checked'));
			} else {
				this.classList.add('active');
				tagLi.forEach((item) => item.classList.add('list-checked'));
			}
			return false;
		});
	});
}

function deployView(obj) {
	const li = obj.closest('.li');
	var thisID = li.getAttribute('id');

	var cont, commit;
	tabTodos.map(function (a) {
		if (a.id == thisID) {
			cont = a.detail;
			commit = a.commit;
		}
	});
	displayCurrent(thisID);
	toLayer(cont, commit);
}

function displayCurrent(id) {
	document.querySelectorAll('.li').forEach((li) => li.classList.remove('current'));
	document.querySelector('#' + id).classList.add('current');
}

function toLayer(cont, cmmt) {
	const content = cont ? cont.replace(/\n/g, '<br>') : '';
	const commit = cmmt ? cmmt : '';
	const button = cmmt ? '<button type="button" class="layer-action-btn" onclick="this.previousElementSibling.click(); viewCommitLog();">키워드 복사 + bash 창 열기</button>' : '';
	const layer = `
		<div class="layer">
			<div class="cont">
				<div class="commit">커밋 키워드: <span class="commit-text" onclick="copyString(this)" title="클릭하여 복사: ${commit}">${commit}</span> ${button}</div>
				<div class="str">${content}</div>
			</div>
		</div>
	`;
	document.documentElement.insertAdjacentHTML('beforeend', layer);
	document.querySelector('.layer .cont').addEventListener('click', function (e) {
		e.preventDefault();
	});
}

function layerRemove() {
	const layer = document.querySelector('.layer');
	layer.remove();
	document.querySelectorAll('.li').forEach((li) => li.classList.remove('current'));
}

document.documentElement.addEventListener('click', function (e) {
	const layer = document.querySelector('.layer');
	if (!layer) return;
	if (e.target.classList.contains('layer')) {
		layerRemove();
	}
});

function markWeekStart() {
	const items = Array.from(document.querySelectorAll('#todo-list .li'));
	const dateItems = items.map((item) => {
		const dateStr = item.querySelector('.date').textContent.trim();
		return { element: item, date: new Date(dateStr), dateStr };
	});
	const weeks = new Map();
	dateItems.forEach(({ element, date, dateStr }) => {
		const year = date.getFullYear();
		const weekNumber = getWeekNumber(date);
		const key = `${year}-${weekNumber}`;
		if (!weeks.has(key)) weeks.set(key, []);
		weeks.get(key).push({ element, date, dateStr });
	});
	weeks.forEach((weekItems) => {
		let sundayItem = [...weekItems].reverse().find(({ date }) => date.getDay() === 6);
		if (!sundayItem) {
			const earliestDateStr = weekItems[weekItems.length - 1].dateStr;
			sundayItem = [...weekItems].reverse().find(({ dateStr }) => dateStr === earliestDateStr);
		}
		if (sundayItem) {
			const lastMatchingItem = [...weekItems].reverse().find(({ dateStr }) => dateStr === sundayItem.dateStr);
			lastMatchingItem.element.classList.add('week-devide');
		}
	});
}

function getWeekNumber(date) {
	const start = new Date(date.getFullYear(), 0, 1);
	const diff = Math.floor((date - start) / (1000 * 60 * 60 * 24));
	return Math.floor((diff + start.getDay()) / 7);
}

function copyString(element) {
	const textToCopy = element.textContent;
	navigator.clipboard.writeText(textToCopy)
		.then(() => {
			console.log('텍스트가 클립보드에 복사되었습니다.');
			// 복사됐다는 걸 눈으로 바로 알 수 있도록 잠깐 표시를 준다.
			element.classList.add('copied');
			setTimeout(() => element.classList.remove('copied'), 900);
		})
		.catch((err) => console.error('클립보드 복사에 실패했습니다: ', err));
}

async function viewCommitLog() {
	await fetch('/run-commit-log');
}

// ---- month.js 병합: 월별 M/M 합계 사이드바 ----
// #mmCont는 정적 HTML에 항상 존재하므로 동적 생성/스타일 주입 로직은 제거했다.

function filterByMonth(arr) {
	return arr.filter((obj) => obj.hasOwnProperty('month'));
}

function mMonthInit(obj) {
	const mmCont = document.getElementById('mmCont');
	if (!mmCont) return;
	mmCont.innerHTML = '';

	let monthlySums = {};
	filterByMonth(obj).forEach(function (item) {
		var date = new Date(item.date);
		var monthh = date.getFullYear() + '-' + (date.getMonth() + 1).toString().padStart(2, '0');
		if (!monthlySums[monthh]) monthlySums[monthh] = 0;
		var sumVal = parseFloat(item.month);
		if (!isNaN(sumVal)) monthlySums[monthh] += sumVal;
	});

	Object.keys(monthlySums).forEach(function (item) {
		var value = monthlySums[item] === 0 ? 0 : monthlySums[item].toFixed(2);
		var div = `<div class="mm"><span class="date_txt">${item}</span><span class="mm_txt">${value}</span></div>`;
		mmCont.insertAdjacentHTML('beforeend', div);
	});
}

// ---- time-alert.js 병합: 설정 화면 체크박스/시간으로 켜고 끄는 업로드 알림 ----

let uploadAlertTimer = null;
let uploadAlertTime = null;

// 시스템 alert() 대신 #upload-button과 .topbar-right 사이의 zone에 닫을 수 있는
// 배너를 innerHTML로 띄운다. 화면을 막지 않고, 닫기 전까지 그대로 떠 있는다.
function showUploadAlertBanner(message) {
	const zone = document.getElementById('upload-alert-zone');
	if (!zone) return;
	zone.innerHTML = `
		<div class="upload-alert-banner">
			<span class="upload-alert-text">${message}</span>
			<button type="button" class="upload-alert-close" title="닫기" onclick="closeUploadAlertBanner()">×</button>
		</div>
	`;
}

function closeUploadAlertBanner() {
	const zone = document.getElementById('upload-alert-zone');
	if (zone) zone.innerHTML = '';
}

// 1초마다 계속 시각을 검사하던 setInterval을 없애고, 지정 시각까지 남은 시간을
// 계산해 딱 한 번만 울리는 setTimeout으로 바꿨다. 배너를 닫아도 반복해서 다시
// 뜨는 문제가 없다. 오늘 그 시각이 이미 지났으면 아무것도 예약하지 않는다
// (시간을 다시 설정하거나, 다음날 새로 열면 그때 기준으로 다시 예약된다).
function startUploadAlertTimer() {
	stopUploadAlertTimer();
	if (!uploadAlertTime) return;

	const [hour, minute] = uploadAlertTime.split(':').map(Number);
	const now = new Date();
	const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
	const delay = target.getTime() - now.getTime();
	if (delay < 0) return;

	uploadAlertTimer = setTimeout(() => {
		uploadAlertTimer = null;
		showUploadAlertBanner(`지정한 시간 ${uploadAlertTime} 입니다!`);
	}, delay);
}

function stopUploadAlertTimer() {
	if (uploadAlertTimer) {
		clearTimeout(uploadAlertTimer);
		uploadAlertTimer = null;
	}
}

async function initUploadAlert() {
	const checkbox = document.getElementById('alert-enabled-checkbox');
	const timeInput = document.getElementById('alert-time-input');
	if (!checkbox || !timeInput) return;

	let cfg = {};
	try {
		cfg = await (await fetch('./config.json')).json();
	} catch (e) {
		console.error('config load failed:', e);
	}

	uploadAlertTime = cfg.uploadAlertTime || '18:00';
	const enabled = !!cfg.uploadAlertEnabled;
	checkbox.checked = enabled;
	timeInput.value = uploadAlertTime;
	timeInput.disabled = !enabled;
	if (enabled) startUploadAlertTimer();

	async function persistAlertSetting() {
		try {
			await fetch('/config/alert', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ enabled: checkbox.checked, time: timeInput.value }),
			});
		} catch (e) {
			console.error('alert setting update failed:', e);
		}
	}

	checkbox.addEventListener('change', () => {
		timeInput.disabled = !checkbox.checked;
		if (checkbox.checked) {
			if (!timeInput.value) timeInput.value = '18:00';
			uploadAlertTime = timeInput.value;
			startUploadAlertTimer();
		} else {
			stopUploadAlertTimer();
		}
		persistAlertSetting();
	});

	timeInput.addEventListener('change', () => {
		uploadAlertTime = timeInput.value;
		if (checkbox.checked) startUploadAlertTimer();
		persistAlertSetting();
	});
}

// 설정 화면의 "Title(로고) 내용 입력": 입력값을 상단바 로고에 바로 반영하고,
// 타이핑이 잠시 멈추면(디바운스) config.json 에 저장한다.
async function initLogoTextSetting() {
	const input = document.getElementById('logo-text-input');
	if (!input) return;
	const logoEl = document.getElementById('topbar-logo');

	let cfg = {};
	try {
		cfg = await (await fetch('./config.json')).json();
	} catch (e) {
		console.error('config load failed:', e);
	}
	input.value = cfg.logoText || '';

	let saveTimer = null;
	input.addEventListener('input', () => {
		if (logoEl) logoEl.textContent = input.value;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(async () => {
			try {
				await fetch('/config/logo-text', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ text: input.value }),
				});
			} catch (e) {
				console.error('logo text update failed:', e);
			}
		}, 400);
	});
}

document.addEventListener('DOMContentLoaded', () => {
	initViewRouting();
	initUploadAlert();
	initLogoTextSetting();
});
