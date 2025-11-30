// Application State Management
const AppState = {
	todos: [],
	tabTodos: [],
	tempLi: '',
	tempTodo: {},
	limit: Infinity,
	config: null,
	users: [],
	masterId: null,
	activeUser: null,
	fileID: null,
	uploadLastDay: null
};

// DOM Elements
const DOM = {
	todoTitle: document.getElementById('Ytitle'),
	todoDetail: document.getElementById('Ydeploy'),
	todoDate: document.getElementById('Ydate'),
	todoUrl: document.getElementById('Yurl'),
	todoCommit: document.getElementById('Ycommit'),
	todoMonth: document.getElementById('Ymonth'),
	addButton: document.getElementById('Ysubmit'),
	todoList: document.getElementById('todo-list'),
	loadButton: document.getElementById('load-button'),
	fileInput: document.getElementById('file-input'),
	saveButton: document.getElementById('save-button'),
	findDetail: document.getElementById('find_string'),
	copyButton: document.getElementById('copy-button')
};

// Initialize application
(async function () {
	try {
		const response = await fetch('/masterUserId');
		const data = await response.json();
		if (data.masterId) {
			AppState.masterId = data.masterId;
			console.log('Master ID:', AppState.masterId);
		} else {
			renderTodos(AppState.todos);
		}
	} catch (error) {
		console.error('Error fetching master user ID:', error);
		renderTodos(AppState.todos);
	}

	try {
		const response = await fetch('./config.json');
		const config = await response.json();
		AppState.config = config;
		
		if (config && config.users && Array.isArray(config.users)) {
			AppState.users = config.users;
			
			if (config.limit && config.limit > 1) {
				AppState.limit = config.limit;
			}
			usersInit(AppState.users);

			if (config.theme) {
				const link = document.createElement('link');
				link.rel = 'stylesheet';
				link.href = `./assets/${config.theme}`;
				document.head.appendChild(link);
			}

			if(config.uploadLastDay) {
				AppState.uploadLastDay = config.uploadLastDay;
			}
		}
	} catch (error) {
		console.error('Error loading config:', error);
	}
})();

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
				if (user.id == AppState.masterId) {
					form.classList.remove('avoid');
					how.classList.remove('avoid');
				} else {
					form.classList.add('avoid');
					how.classList.add('avoid');
				}
			});
			
			if (user.id == AppState.masterId) {
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
	try {
		if (userId === AppState.masterId) {
			const response = await fetch(`./data/${userId}.json`);
			let todoData = await response.json();
			todoData.sort((a, b) => new Date(b.date) - new Date(a.date));
			AppState.activeUser = userId;

			countingTodo(todoData);
			renderTodos(todoData.slice(0, AppState.limit));
			AppState.tabTodos = todoData;
			currentTabInit(userId);
			AppState.todos = todoData;
			loadingRemove();
		} else {
			const fileContent = await fetchNotionFiles(userId);
			console.log(fileContent.todos);
			AppState.todos = fileContent.todos;
			AppState.activeUser = userId;
			countingTodo(AppState.todos);
			renderTodos(AppState.todos.slice(0, AppState.limit));
			AppState.tabTodos = AppState.todos;
			currentTabInit(userId);
			loadingRemove();
		}
	} catch (error) {
		console.error('Error loading todo data:', error);
		loadingRemove();
	}
}

function countingTodo(src) {
	let countTodo = src.length;
	let summaryCount = document.getElementById('count');
	summaryCount.innerHTML = `${countTodo}`;
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
		console.error('config.json load error');
	}
}

// Helper: Create button HTML strings
function createDetailButton(hasDetail) {
	return hasDetail 
		? '<button onclick="deployView(this);" class="deploy-file">Detail</button>' 
		: '';
}

function createUrlLink(url) {
	return url && url !== 'undefined' 
		? `<a href="${url}" class="url" title="${url}" target="_blank">URL</a>` 
		: '';
}

function createEndButton(ended, todoId) {
	return !ended 
		? `<button class="end-button" data-id="${todoId}">Finish</button>` 
		: '';
}

// Create common todo HTML structure
function createTodoHTML(todo, isMaster) {
	const detailButton = createDetailButton(todo.detail);
	const urlLink = createUrlLink(todo.url);
	const endButton = isMaster ? createEndButton(todo.ended, todo.id) : '';
	
	const baseHTML = `
		<p class="date-title">
			<span class="date">${todo.date}</span>
			<span class="title">${todo.title}</span>
			<span class="month">${todo?.month ?? ''}</span>
			${detailButton}
			${urlLink}
		</p>
	`;

	if (isMaster) {
		return baseHTML + `
			<p class="functions">
				${endButton}
				<button class="edit-button" data-id="${todo.id}">Edit</button>
				<button class="delete-button" data-id="${todo.id}">Delete</button>
			</p>
			<div class="deploy"><pre>${todo?.detail ?? ''}</pre></div>
		`;
	} else {
		return baseHTML + `
			<p class="functions"></p>
			<div class="deploy"><pre>${todo?.detail ?? ''}</pre></div>
		`;
	}
}

function renderTodos(todos) {
	DOM.todoList.innerHTML = '';
	if (todos.length === 0) {
		DOM.todoList.innerHTML = '<p>No todo found.</p>';
		return;
	}
	
	todos.sort((a, b) => new Date(b.date) - new Date(a.date));

	const isMaster = AppState.masterId === AppState.activeUser;

	todos.forEach((todo, index) => {
		const li = document.createElement('li');
		li.dataset.index = index;
		li.classList.add('li');
		li.setAttribute('id', todo.id);
		
		// Normalize todo properties
		if (todo.notion) {
			todo.url = todo.notion;
		}
		
		// Add ended class if needed
		if (todo.ended) {
			li.classList.add('ended');
		}

		// Create and insert HTML
		li.innerHTML = createTodoHTML(todo, isMaster);

		// Add edit event listener for master user only
		if (isMaster) {
			const editButton = li.querySelector('.edit-button');
			editButton.addEventListener('click', () => {
				bindEdit(todo);
			});
		}

		DOM.todoList.appendChild(li);
	});

	document.getElementById('Ydate').valueAsDate = new Date();

	// Load plugins
	loadPlugins();
}

async function loadPlugins() {
	try {
		const response = await fetch('./config.json');
		const config = await response.json();
		
		if (config && config.plugins && Array.isArray(config.plugins)) {
			config.plugins.forEach((plugin) => {
				const oldScript = document.querySelector(`script[src="./assets/${plugin}"]`);
				if (oldScript) {
					oldScript.remove();
				}
				const script = document.createElement('script');
				script.src = `./assets/${plugin}`;
				document.head.appendChild(script);
			});
		}
	} catch (error) {
		console.error('Error loading plugins:', error);
	}
}

function bindEdit(obj) {
	const li = document.getElementById(obj.id);
	AppState.tempLi = li.innerHTML;
	AppState.tempTodo = obj;
	li.classList.add('edit');
	li.innerHTML = `
		<p class="date-title">
			<input type="date" class="edit-date" value="${obj.date}">
			<input type="text" class="edit-title" value="${obj.title}">
			<input type="number" step="0.01" class="edit-month" value="${obj?.month ?? ''}" placeholder="퍼블리싱 M/M">
			<input type="text" class="edit-url" value="${obj?.url ?? ''}" placeholder="노션 URL">
			<input type="text" class="edit-commit" value="${obj?.commit ?? ''}" placeholder="커밋 코멘트">
			<textarea class="edit-detail" rows="10">${obj?.detail ?? ''}</textarea>
		</p>
		<p class="functions">
			<input type="checkbox" class="edit-ended" ${obj.ended ? 'checked' : ''}>
			<button class="save-button" onclick="editSave('${obj.id}')">Save</button>
			<button class="cancel-button" onclick="editCancel('${obj.id}')">Cancel</button>
		</p>
	`;
}

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
	AppState.todos[index] = removeEmptyKeys(newObj);

	const detailCont = createDetailButton(newObj.detail);
	const urlStr = createUrlLink(newObj.url);
	const endStr = createEndButton(newObj.ended, editID);

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
	
	if (newObj.ended) {
		li.classList.add('ended');
	} else {
		li.classList.remove('ended');
	}
	
	const editButton = li.querySelector('.edit-button');
	editButton.addEventListener('click', function () {
		bindEdit(newObj);
	});

	saveTodos();
	if (typeof mMonthInit !== 'undefined') {
		mMonthInit(AppState.todos);
	}
	renderTodos(AppState.todos);
}

function editCancel(id) {
	const li = document.getElementById(id);
	li.classList.remove('edit');
	li.innerHTML = AppState.tempLi;

	const editButton = li.querySelector('.edit-button');
	editButton.addEventListener('click', function () {
		bindEdit(AppState.tempTodo);
	});
}

function saveTodos() {
	DOM.saveButton.click();
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

DOM.addButton.addEventListener('click', () => {
	const newTodo = {
		id: generateId(),
		title: DOM.todoTitle.value,
		detail: DOM.todoDetail.value,
		date: DOM.todoDate.value,
		url: DOM.todoUrl.value,
		commit: DOM.todoCommit.value,
		month: DOM.todoMonth.value,
		ended: false,
	};
	if (!newTodo.title) {
		alert('제목을 입력해 주세요');
		return;
	}
	if (!newTodo.date) {
		alert('날짜가 없습니다. 리스트 맨 하단에 추가됩니다.');
	}
	const newTodoNEW = removeEmptyKeys(newTodo);
	AppState.todos.unshift(newTodoNEW);
	countingTodo(AppState.todos);
	renderTodos(AppState.todos);
	saveTodos();
	DOM.todoTitle.value = '';
	DOM.todoDetail.value = '';
	DOM.todoUrl.value = '';
	DOM.todoCommit.value = '';
	DOM.todoMonth.value = '';
});

DOM.todoList.addEventListener('click', (event) => {
	if (event.target.classList.contains('delete-button')) {
		var result = confirm('Want to delete?');
		if (result) {
			const id = event.target.dataset.id;
			AppState.todos = AppState.todos.filter((todo) => todo.id !== id);

			const index = document.getElementById(id).dataset.index;
			const liToRemove = document.querySelector(`li[data-index="${index}"]`);
			if (liToRemove) {
				liToRemove.remove();
			}
			updateIndexes();
			saveTodos();
			if (typeof mMonthInit !== 'undefined') {
				mMonthInit(AppState.todos);
			}
			countingTodo(AppState.todos);
		}
	}
});

function updateIndexes() {
	const listItems = document.querySelectorAll('.li');
	listItems.forEach((li, newIndex) => {
		li.setAttribute('data-index', newIndex);
	});
}

DOM.todoList.addEventListener('click', (event) => {
	if (event.target.classList.contains('end-button')) {
		var result = confirm('Want to Finish?');
		if (result) {
			const id = event.target.dataset.id;
			const todo = AppState.todos.find((todo) => todo.id === id);
			if (todo) {
				todo.ended = true;
				console.log(`ID: ${id} 완료 처리됨`, todo);
			}
			saveTodos();
			renderTodos(AppState.todos);
		}
	}
});

DOM.loadButton.addEventListener('click', () => {
	DOM.fileInput.click();
});

DOM.fileInput.addEventListener('change', (event) => {
	const file = event.target.files[0];
	const reader = new FileReader();
	reader.onload = (e) => {
		try {
			const loadedTodos = JSON.parse(e.target.result);
			AppState.todos = loadedTodos;
			saveTodos();
			renderTodos(AppState.todos);
		} catch (error) {
			console.error('Error loading JSON file:', error);
			alert('Invalid JSON file.');
		}
	};
	reader.readAsText(file);
});

DOM.saveButton.addEventListener('click', (e) => {
	AppState.todos.sort((a, b) => new Date(b.date) - new Date(a.date));
	fetch('/save', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({ todos: AppState.todos }),
	})
		.then((response) => response.json())
		.then((data) => {
			console.log('Todos saved:', data);
			checkMotion(e);
		})
		.catch((error) => {
			console.error('Error saving todos:', error);
		});
});

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

DOM.findDetail.addEventListener('click', function () {
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
	AppState.todos.forEach(function (item) {
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

DOM.copyButton.addEventListener('click', async (e) => {
	try {
		const fileName = `${AppState.activeUser}.json`;
		const fileContent = JSON.stringify(AppState.todos, null, 2);

		await navigator.clipboard.writeText(fileContent);
		checkMotion(e);
	} catch (error) {
		console.error('Error copying file content to clipboard:', error);
	}
});

document.documentElement.addEventListener('click', async (event) => {
	if (event.target.classList.contains('upload-button')) {
		fnLoadingInButton('.upload-button');

		let uploadTodo = AppState.todos;
		if(AppState.uploadLastDay > 0){
			uploadTodo = getRecentTodos(AppState.todos, AppState.uploadLastDay);
		}

		console.log('json 글자 수가 '+ JSON.stringify({ uploadTodo }).length + ' 입니다.');
		const info = document.querySelector('#last-upload-info');
		info.innerHTML = '(업로드 된 문자 수: '+ JSON.stringify({ uploadTodo }).length +')';

		if(JSON.stringify({ uploadTodo }).length > 20000) {
			alert('json 글자 수가 '+ JSON.stringify({ uploadTodo }).length + ' 입니다. config에서 "uploadLastDay" 값을 변경해 주세요. 일단 오늘은 올려드리겠습니다.')
		}
		const ok = await updateNotionFile(AppState.masterId, uploadTodo);
		console.log(ok);
		document.querySelector('.loading-in-button').remove();
		checkMotion(event);
	}
});

function getRecentTodos(todoJson, day) {
	const today = new Date();
	today.setHours(0, 0, 0, 0);

	const startDate = new Date(today);
	startDate.setDate(startDate.getDate() - day);

	return todoJson.filter(todo => {
		const todoDate = new Date(todo.date);
		todoDate.setHours(0, 0, 0, 0);
		return todoDate >= startDate;
	});
}