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

		(data.themes || []).forEach((file) => {
			const opt = document.createElement('option');
			opt.value = file;
			opt.textContent = file;
			if (file === current) opt.selected = true;
			select.appendChild(opt);
		});

		// theme 가 비었거나 목록에 없으면 base 가 선택된 것처럼 표시
		if (!current || !(data.themes || []).includes(current)) {
			baseOpt.selected = true;
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
	} catch (e) {
		console.error('theme list load failed:', e);
	}
}

async function usersInit(users) {
	const tabs = document.querySelector('.tabs');
	const form = document.querySelector('.js-toDoForm');
	const how = document.querySelector('.how');
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
				if (user.id == masterId) {
					form.classList.remove('avoid');
					how.classList.remove('avoid');
				} else {
					form.classList.add('avoid');
					how.classList.add('avoid');
				}
			});
			if (user.id == masterId) {
				tab.classList.add('active');
				tab.click();
			}
		}
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
		console.log(fileContent.todos)
		// todos = JSON.parse(fileContent.todos);
		todos = fileContent.todos;
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

function renderTodos(todos) {
	todoList.innerHTML = '';
	if (todos.length === 0) {
		todoList.innerHTML = '<p>No todo found.</p>';
	}
	todos.sort((a, b) => new Date(b.date) - new Date(a.date)); //sort by date

	todos.forEach((todo, index) => {
		const li = document.createElement('li');
		let urlStr = ``;
		let endStr = ``;
		li.dataset.index = index; // 데이터셋에 index 저장 (수정 시 활용)
		li.classList.add('li');
		li.setAttribute('id', todo.id);
		if (todo.deploy && typeof todo.deploy !== 'undefined') {
			todo.detail = todo.deploy;
			delete todo.deploy;
		} else if (todo.detail && typeof todo.detail !== 'undefined') {
			todo.detail = todo.detail;
		} else {
			// todo.detail = '';
		}
		if (todo.notion && typeof todo.notion !== 'undefined') {
			todo.url = todo.notion;
		} else if (todo.url && typeof todo.url !== 'undefined') {
			todo.url = todo.url;
		} else {
			// todo.url = '';
		}
		if (todo.month && typeof todo.month !== 'undefined') {
			todo.month = todo.month;
		} else {
			// todo.month = '';
		}

		// deploy 파일 여부 확인
		var deployFiles;
		if (todo.detail || todo.commit) {
			deployFiles = '<button onclick="deployView(this);" class="deploy-file">Detail</button>';
		} else {
			deployFiles = '';
		}

		if (masterId === activeUser) {
			// master 유저 인 경우
			if (todo.url !== 'undefined' && todo.url) {
				urlStr = `<a href="${todo.url}" class="url" title="${todo?.url ?? ''}" target="_blank">URL</a>`;
			}
			if (todo.ended !== true) {
				endStr = `<button class="end-button" data-id="${todo.id}">Finish</button>`;
			} else {
				li.classList.add('ended');
			}
			li.innerHTML = `
                <p class="date-title">
                    <span class="date">${todo.date}</span>
                    <span class="title">${todo.title}</span>
                    <span class="month">${todo?.month ?? ''}</span>
                    ${deployFiles}
                    ${urlStr}
                </p>
                <p class="functions">
                    ${endStr}
                    <button class="edit-button" data-id="${todo.id}">Edit</button>
                    <button class="delete-button" data-id="${todo.id}">Delete</button>
                </p>
                <div class="deploy"><pre>${todo?.month ?? ''}</pre></div>
            `;

			const editButton = li.querySelector('.edit-button');
			editButton.addEventListener('click', () => {
				bindEdit(todo);
			});
		} else {
			// member 유저 인 경우 view만 제공공
			if (todo.url !== 'undefined' && todo.url) {
				urlStr = `<a href="${todo.url}" class="url" title="${todo.url}" target="_blank">URL</a>`;
			}
			if (todo.ended === true) {
				li.classList.add('ended');
			}
			li.innerHTML = `
                <p class="date-title">
                    <span class="date">${todo.date}</span>
                    <span class="title">${todo.title}</span>
					<span class="month">${todo?.month ?? ''}</span>
                    ${deployFiles}
                    ${urlStr}
                </p>
                <p class="functions">
                </p>
                <div class="deploy"><pre>${todo.detail}</pre></div>
            `;
		}

		todoList.appendChild(li);
	});

	document.getElementById('Ydate').valueAsDate = new Date();

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

	let detailCont;
	newObj.detail ? (detailCont = '<button onclick="deployView(this);" class="deploy-file">Detail</button>') : (detailCont = '');

	let urlStr;
	newObj.url ? (urlStr = `<a href="${newObj.url}" class="url" title="${newObj.url}" target="_blank">URL</a>`) : (urlStr = '');

	let endStr;
	newObj.ended ? (endStr = '') : (endStr = `<button class="end-button" data-id="${editID}">Finish</button>`);

	li.innerHTML = `
		<p class="date-title">
			<span class="date">${newObj.date}</span>
			<span class="title">${newObj.title}</span>
			<span class="month">${newObj?.month ?? ''}</span>
			${detailCont}
			${urlStr}
		</p>
		<p class="functions">
			${endStr}
			<button class="edit-button" data-id="${editID}">Edit</button>
			<button class="delete-button" data-id="${editID}">Delete</button>
		</p>
		<div class="deploy"><pre>${newObj.detail}</pre></div>
	`;
	li.classList.remove('edit');
	const editButton = li.querySelector('.edit-button');
	editButton.addEventListener('click', function () {
		bindEdit(newObj);
	});

	saveTodos(); // 서버에 저장
	if (typeof mMonthInit !== 'undefined') {
		mMonthInit(todos);
	}
	if (newObj.ended !== true) {
		li.classList.remove('ended');
	} else {
		li.classList.add('ended');
	}
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