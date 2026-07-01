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
		// --------------- localStorage.setItem('todos', JSON.stringify(todoData));
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
		? `<span class="commit-text" title="${todo.commit}">${todo.commit}</span>`
		: `<span class="col-empty">–</span>`;

	const hasMonth = todo.month !== undefined && todo.month !== null && todo.month !== '';
	const mmCell = hasMonth ? todo.month : '–';

	const hasDetail = !!(todo.detail || todo.commit);
	const detailBtn = hasDetail
		? `<button onclick="deployView(this);" class="deploy-file" title="상세 보기"></button>`
		: '';

	let functionsHTML = detailBtn;
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
		<span class="date">${todo.date ?? ''}</span>
		<span class="title">${todo.title ?? ''}</span>
		<span class="col-mm${hasMonth ? '' : ' is-empty'}">${mmCell}</span>
		<div class="col-notion">${urlCell}</div>
		<div class="col-commit">${commitCell}</div>
		<p class="functions">${functionsHTML}</p>
		<div class="deploy"><pre>${todo?.detail ?? ''}</pre></div>
	`;
}

function renderTodos(todos) {
	todoList.innerHTML = '';
	if (todos.length === 0) {
		todoList.innerHTML = '<p>No todo found.</p>';
	}
	todos.sort((a, b) => new Date(b.date) - new Date(a.date)); //sort by date

	const isMaster = masterId === activeUser;

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
	if (typeof applyTaskFilters === 'function') {
		applyTaskFilters();
	}

	// plugins init
	fetch('./config.json')
		.then((response) => response.json())
		.then((config) => {
			if (config && config.plugins && Array.isArray(config.plugins)) {
				const plugins = config.plugins;
				plugins.forEach((plugin) => {
					const oldScript = document.querySelector(`script[src="./assets/${plugin}"]`);
					if (oldScript) {
						oldScript.remove(); // 기존 script 삭제
					}
					const script = document.createElement('script');
					script.src = `./assets/${plugin}`;
					document.head.appendChild(script);
				});
			}
		});
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
				<input type="checkbox" class="edit-ended" ${obj.ended ? 'checked' : ''}>
				<button class="save-button" onclick="editSave('${obj.id}')">Save</button>
				<button class="cancel-button" onclick="editCancel('${obj.id}')">Cancel</button>
			</p>
		`;
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
	//------------------- localStorage.setItem('todos', JSON.stringify(todos));
	saveButton.click();
}
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
      alert(`저장 실패: ${res.status}`);
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
	if (event.target.classList.contains('upload-button')) {
		// try {
		fnLoadingInButton('.upload-button');

		let uploadTodo = todos;
		if(uploadLastDay > 0){
			uploadTodo = getRecentTodos(todos, uploadLastDay);
		}

		console.log('json 글자 수가 '+ JSON.stringify({ uploadTodo }).length + ' 입니다.');
		const info = document.querySelector('#last-upload-info');
		info.innerHTML = '(업로드 된 문자 수: '+ JSON.stringify({ uploadTodo }).length +')';

		if(JSON.stringify({ uploadTodo }).length > 20000) {
			alert('json 글자 수가 '+ JSON.stringify({ uploadTodo }).length + ' 입니다. config에서 "uploadLastDay" 값을 변경해 주세요. 일단 오늘은 올려드리겠습니다.')
		}
		const ok = await updateNotionFile(masterId, uploadTodo);
		console.log(ok);
		document.querySelector('.loading-in-button').remove();
		checkMotion(event);
		if (ok) {
			lastSyncAt = new Date();
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

	statusCard.classList.toggle('disconnected', !connected);
	statusCard.innerHTML = `
		<div class="sync-status-icon"><i></i></div>
		<div class="sync-status-info">
			<div class="sync-status-title">${connected ? '연결됨' + (deptLabel ? ' · ' + deptLabel + ' 업무 데이터베이스' : '') : '연결 안됨'}</div>
			<div class="sync-status-sub">${lastSyncAt ? '마지막 동기화 · ' + timeAgo(lastSyncAt) : '이 세션에서 동기화한 기록이 없습니다'}</div>
		</div>
		<button type="button" class="sync-status-action" id="sync-now-button" ${connected ? '' : 'disabled'}>지금 동기화</button>
	`;
	const syncBtn = document.getElementById('sync-now-button');
	if (syncBtn) {
		syncBtn.addEventListener('click', async () => {
			const upload = document.getElementById('upload-button');
			if (upload) upload.click();
			await loadAllUsersTodos(true);
		});
	}

	const map = await loadAllUsersTodos();
	userList.innerHTML = '';
	(users || []).filter((u) => u.active).forEach((u) => {
		const list = map[u.id] || [];
		const row = document.createElement('div');
		row.className = 'sync-user-row';
		row.innerHTML = `
			<div class="member-avatar" style="background:${memberColor(u)}">${u.name.charAt(0)}</div>
			<div class="sync-user-name">${u.name}</div>
			<div class="sync-user-time">${u.id === masterId && lastSyncAt ? '마지막 업로드 · ' + timeAgo(lastSyncAt) : '마지막 업로드 기록 없음'}</div>
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

	// 월별 집계 (데이터가 있는 달 중 최근 6개월)
	const byMonth = {};
	allTodos.forEach((t) => {
		const key = monthKeyOf(t.date);
		if (!key) return;
		if (!byMonth[key]) byMonth[key] = { count: 0, mm: 0 };
		byMonth[key].count += 1;
		byMonth[key].mm += parseFloat(t.month) || 0;
	});
	const months = Object.keys(byMonth).sort().slice(-6);

	if (!months.length) {
		countChartEl.innerHTML = '<p class="muted-note">데이터가 없습니다.</p>';
		mmTrendEl.innerHTML = '<p class="muted-note">데이터가 없습니다.</p>';
	} else {
		countChartEl.innerHTML = '';
		const maxCount = Math.max(1, ...months.map((m) => byMonth[m].count));
		months.forEach((m) => {
			const count = byMonth[m].count;
			const col = document.createElement('div');
			col.className = 'bar-col' + (count === maxCount ? ' bar-max' : '');
			const heightPx = Math.max(6, Math.round((count / maxCount) * 100));
			col.innerHTML = `<div class="bar" style="height:${heightPx}px" title="${count}건"></div><div class="bar-label">${m.slice(5)}월</div>`;
			countChartEl.appendChild(col);
		});

		mmTrendEl.innerHTML = '';
		const maxMM = Math.max(0.01, ...months.map((m) => byMonth[m].mm));
		[...months].reverse().forEach((m) => {
			const mm = byMonth[m].mm;
			const pct = Math.max(2, Math.round((mm / maxMM) * 100));
			const row = document.createElement('div');
			row.className = 'hbar-row';
			row.innerHTML = `<div class="hbar-label">${m.slice(5)}월</div><div class="hbar-track"><div class="hbar-fill" style="width:${pct}%"></div></div><div class="hbar-value">${mm.toFixed(2)}</div>`;
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

document.addEventListener('DOMContentLoaded', () => {
	initViewRouting();
});
