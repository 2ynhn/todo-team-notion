process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const { Client } = require('@notionhq/client');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const app = express();
const port = 3000;
const config = JSON.parse(fs.readFileSync('./config.json', 'utf8'));
const users = config.users;
const notionAPI = config.notionAPI;
const notionID = config.notionID;
const agent = new https.Agent({
	rejectUnauthorized: false,
});

const notion = new Client({ auth: notionAPI });
const databaseId = notionID;

axios.defaults.httpsAgent = new https.Agent({ rejectUnauthorized: false });

// CORS 미들웨어 추가
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
	res.sendFile(__dirname + '/index.html');
});



// GET /todos/:userId  -> 해당 유저의 JSON 배열 반환
app.get('/todos/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log(userId);

  try {
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });

    const dataSourceId = database.data_sources[0].id;
    const query = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        property: 'user',
        title: {
          equals: userId
        }
        // rich_text: { equals: userId },  // user 열이 텍스트인 경우
      },
    });

    if (query.results.length === 0) {
      return res.status(404).json({ message: 'user row not found' });
    }

    const page = query.results[0];
    const valueProp = page.properties.value;
    

    let rawText = '';

    if (valueProp && Array.isArray(valueProp.rich_text)) {
      rawText = valueProp.rich_text.map(rt => rt.plain_text || rt.text?.content || '').join('');
    }
    let todos = [];
    try {
      todos = rawText.length > 0 ? JSON.parse(rawText) : [];
    } catch (e) {
      console.warn('JSON parse error:', e);
      todos = [];
    }
    res.json({ user: userId, todos });
	// console.log(page, valueProp, rawText, todos, res);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to load todos' });
  }
});

// PUT /todos/:userId  body: { todos: [ {...}, {...} ] }
app.put('/todos/:userId', async (req, res) => {
  const userId = req.params.userId;
  const todos = req.body.todos;

  if (!Array.isArray(todos)) {
    return res.status(400).json({ error: 'todos must be array' });
  }

  try {
    // 1) 데이터베이스 정보 가져와서 data_source_id 추출
    const database = await notion.databases.retrieve({
      database_id: databaseId,
    });
    if (!database.data_sources || database.data_sources.length === 0) {
      return res.status(500).json({ error: 'No data sources found in database' });
    }
    const dataSourceId = database.data_sources[0].id;

    // 2) dataSources.query로 user 필터링
    const query = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        property: 'user',
        rich_text: { equals: userId },
      },
    });

    if (query.results.length === 0) {
      return res.status(404).json({ message: 'user row not found' });
    }

    const pageId = query.results[0].id;

    // 3) JSON 배열을 문자열로 변환
    const jsonString = JSON.stringify(todos);

	function splitTextIntoChunks(text, chunkSize = 2000) {
		const chunks = [];
		for (let i = 0; i < text.length; i += chunkSize) {
			chunks.push(text.slice(i, i + chunkSize));
		}
		return chunks;
	}
	const chunks = splitTextIntoChunks(jsonString);
	const richTextArray = chunks.map(chunk => ({
		type: 'text',
		text: { content: chunk }
	}));

    // 4) 페이지 업데이트
    await notion.pages.update({
      page_id: pageId,
      properties: {
        value: {
          rich_text: richTextArray,
        },
      },
    });

    res.json({ message: 'updated', user: userId });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to update todos' });
  }
});



app.get('/masterUserId', (req, res) => {
	// config.json 파일에서 master role을 가진 user의 id를 찾습니다.
	const masterUser = users.find((user) => user.role === 'master');
	if (masterUser) {
		res.json({ masterId: masterUser.id });
	} else {
		res.status(404).json({ message: 'Master user not found.' });
	}
});


// 선택 가능한 테마 css 목록 (style.css 제외)
app.get('/themes', (req, res) => {
	const assetsDir = path.join(__dirname, 'assets');
	fs.readdir(assetsDir, (err, files) => {
		if (err) {
			console.error('Error reading assets dir:', err);
			return res.status(500).json({ error: 'cannot read assets directory' });
		}
		const themes = files
			.filter((f) => f.endsWith('.css') && f !== 'style.css')
			.sort();
		res.json({ base: 'style.css', themes, current: config.theme || '' });
	});
});

// config.json 의 theme 값 변경
app.post('/config/theme', (req, res) => {
	const theme = req.body.theme ?? '';
	const assetsDir = path.join(__dirname, 'assets');

	// 화이트리스트 검증: 실제 assets 폴더에 존재하는 css 만 허용 (경로 조작 방지)
	let assetFiles = [];
	try {
		assetFiles = fs.readdirSync(assetsDir);
	} catch (e) {
		return res.status(500).json({ error: 'cannot read assets directory' });
	}
	const isValid =
		theme === '' ||
		(assetFiles.includes(theme) && theme.endsWith('.css') && theme !== 'style.css');
	if (!isValid) {
		return res.status(400).json({ error: 'invalid theme', theme });
	}

	try {
		const cfgPath = path.join(__dirname, 'config.json');
		const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
		cfg.theme = theme;
		// config.json 의 기존 들여쓰기(4 spaces) 유지
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4) + '\n', 'utf8');
		config.theme = theme; // 메모리상 config 동기화
		res.json({ message: 'theme updated', theme });
	} catch (e) {
		console.error('Error updating theme:', e);
		res.status(500).json({ error: 'failed to update theme', details: e.message });
	}
});

// config.json 의 limit 값 변경 (설정 화면의 "표시 행수")
app.post('/config/limit', (req, res) => {
	const raw = req.body.limit;
	const limit = raw === 'all' ? 'all' : parseInt(raw, 10);
	const isValid = limit === 'all' || (Number.isInteger(limit) && limit > 0);
	if (!isValid) {
		return res.status(400).json({ error: 'invalid limit', limit: raw });
	}

	try {
		const cfgPath = path.join(__dirname, 'config.json');
		const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
		cfg.limit = limit === 'all' ? 0 : limit;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4) + '\n', 'utf8');
		config.limit = cfg.limit;
		res.json({ message: 'limit updated', limit: cfg.limit });
	} catch (e) {
		console.error('Error updating limit:', e);
		res.status(500).json({ error: 'failed to update limit', details: e.message });
	}
});

// config.json 의 업로드 알림(uploadAlertEnabled/uploadAlertTime) 값 변경
app.post('/config/alert', (req, res) => {
	const enabled = !!req.body.enabled;
	const time = req.body.time;
	const isValidTime = typeof time === 'string' && /^([01]\d|2[0-3]):([0-5]\d)$/.test(time);
	if (!isValidTime) {
		return res.status(400).json({ error: 'invalid time', time });
	}

	try {
		const cfgPath = path.join(__dirname, 'config.json');
		const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
		cfg.uploadAlertEnabled = enabled;
		cfg.uploadAlertTime = time;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4) + '\n', 'utf8');
		config.uploadAlertEnabled = enabled;
		config.uploadAlertTime = time;
		res.json({ message: 'alert setting updated', enabled, time });
	} catch (e) {
		console.error('Error updating alert setting:', e);
		res.status(500).json({ error: 'failed to update alert setting', details: e.message });
	}
});

// 커밋 로그 실행 요청을 처리하는 API 엔드포인트
app.get('/run-commit-log', (req, res) => {
	// 실제 셸 스크립트가 있는 경로를 지정합니다.
	// const scriptPath = `${__dirname}/extract_files.sh`;
	const scriptPath = path.join(__dirname, 'extract_files.sh');

	// Git Bash를 사용하여 스크립트를 실행합니다.
	// Windows에서는 Git Bash 실행 파일의 경로를 정확히 지정해야 할 수 있습니다.
	const command = `start "Git Bash Log Viewer" "C:\\Program Files\\Git\\bin\\bash.exe" "${scriptPath}"`;

	exec(command, (error, stdout, stderr) => {
		if (error) {
			console.error(`exec error: ${error}`);
			return res.status(500).send(`Error: ${stderr}`);
		}
		console.log(`stdout: ${stdout}`);
		res.send(`<pre>${stdout}</pre>`); // 스크립트 출력 결과를 HTML로 전송
	});
});



app.post('/save', (req, res) => {
	console.log(req.body);
	const todos = req.body.todos;
	const dataDir = './data';
	// data 디렉토리가 없는 경우 생성
	if (!fs.existsSync(dataDir)) {
		fs.mkdirSync(dataDir);
	}
	const masterUser = users.find((user) => user.role === 'master');
	if (masterUser) {
		const fileName = `${masterUser.id}.json`;
		const filePath = `${dataDir}/${fileName}`;
		fs.writeFile(filePath, JSON.stringify(todos, null, 2), (err) => {
			if (err) {
				console.error(err);
				res.status(500).json({ message: 'Error saving todos' });
			} else {
				res.json({ message: 'Todos saved successfully' });
			}
		});
	} else {
		res.status(404).json({ message: 'Master user not found.' });
	}
});
app.listen(port, () => {
	console.log(`Server listening on port ${port}`);
});
