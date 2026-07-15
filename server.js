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

    // 5) 업로드 성공 시각을 서버에 영속 기록 (브라우저 새로고침/재접속해도 유지)
    const recorded = recordSyncMeta(userId);
    console.log(`[upload] Notion 업데이트 성공 (user=${userId}), sync-meta 기록 ${recorded ? '성공' : '실패'}`);

    res.json({ message: 'updated', user: userId, lastUploadAt: readSyncMeta()[userId] });
  } catch (e) {
    // 실패 원인을 뭉뚱그리지 않고 그대로 내려보낸다 (예: DB/페이지를 못 찾음, 권한 없음 등).
    // 여기서 실패하면 recordSyncMeta는 호출되지 않으므로 Sync 화면에 "업로드 기록 없음"이
    // 뜨는 게 정상 동작이다 — 실제로 Notion에 반영된 적이 없다는 뜻이기 때문.
    console.error('[upload] Notion 업데이트 실패:', e.message || e);
    res.status(500).json({ error: 'failed to update todos', details: e.message || String(e) });
  }
});

// GET /rest-all -> 전체 유저의 'rest'(휴가일) 값을 한 번에 반환 { [userId]: rest }
// /notion-status와 같은 방식으로 데이터베이스를 한 번만 조회해서 모든 유저 값을 뽑아낸다.
app.get('/rest-all', async (req, res) => {
  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    if (!database.data_sources || database.data_sources.length === 0) {
      return res.json({});
    }
    const dataSourceId = database.data_sources[0].id;
    const query = await notion.dataSources.query({ data_source_id: dataSourceId });

    const result = {};
    query.results.forEach((page) => {
      const userId = extractUserIdFromPage(page);
      if (!userId) return;

      const restProp = page.properties.rest;
      let rawText = '';
      if (restProp && Array.isArray(restProp.rich_text)) {
        rawText = restProp.rich_text.map((rt) => rt.plain_text || rt.text?.content || '').join('');
      }
      let rest = [];
      try {
        rest = rawText.length > 0 ? JSON.parse(rawText) : [];
      } catch (e) {
        console.warn('rest JSON parse error:', e);
        rest = [];
      }
      result[userId] = rest;
    });
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (e) {
    console.error('[rest-all] failed:', e.message || e);
    res.status(500).json({ error: 'failed to load rest data', details: e.message || String(e) });
  }
});

// PUT /rest/:userId  body: { rest: [ {...} ] }  -> 해당 유저 페이지의 'rest' 속성만 갱신
app.put('/rest/:userId', async (req, res) => {
  const userId = req.params.userId;
  const rest = req.body.rest;

  if (!Array.isArray(rest)) {
    return res.status(400).json({ error: 'rest must be array' });
  }

  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    if (!database.data_sources || database.data_sources.length === 0) {
      return res.status(500).json({ error: 'No data sources found in database' });
    }
    const dataSourceId = database.data_sources[0].id;

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
    const jsonString = JSON.stringify(rest);

    function splitTextIntoChunks(text, chunkSize = 2000) {
      const chunks = [];
      for (let i = 0; i < text.length; i += chunkSize) {
        chunks.push(text.slice(i, i + chunkSize));
      }
      return chunks;
    }
    const chunks = splitTextIntoChunks(jsonString);
    const richTextArray = chunks.map((chunk) => ({
      type: 'text',
      text: { content: chunk },
    }));

    await notion.pages.update({
      page_id: pageId,
      properties: {
        rest: {
          rich_text: richTextArray,
        },
      },
    });

    res.json({ message: 'updated', user: userId });
  } catch (e) {
    console.error('[rest] Notion 업데이트 실패:', e.message || e);
    res.status(500).json({ error: 'failed to update rest', details: e.message || String(e) });
  }
});

// 유저별 "마지막 업로드 시각"을 data/sync-meta.json에 기록/조회
const syncMetaPath = path.join(__dirname, 'data', 'sync-meta.json');

function readSyncMeta() {
  try {
    return JSON.parse(fs.readFileSync(syncMetaPath, 'utf8'));
  } catch (e) {
    return {};
  }
}

function recordSyncMeta(userId) {
  try {
    if (!fs.existsSync(path.join(__dirname, 'data'))) {
      fs.mkdirSync(path.join(__dirname, 'data'));
    }
    const meta = readSyncMeta();
    meta[userId] = new Date().toISOString();
    fs.writeFileSync(syncMetaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
    return true;
  } catch (e) {
    console.error('Error recording sync meta:', e);
    return false;
  }
}

// 유저별 마지막 업로드 시각 조회 (Sync 화면에서 사용). 브라우저/중간 프록시가
// 캐시해서 새로고침해도 갱신 안 되는 상황을 막기 위해 캐시를 명시적으로 끈다.
app.get('/sync-meta', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(readSyncMeta());
});

// Notion 페이지의 'user' 속성 값을 읽는다. DB 스키마에 따라 title/rich_text
// 둘 중 하나일 수 있어(GET에서는 title, PUT에서는 rich_text로 필터링하고 있음) 둘 다 지원한다.
function extractUserIdFromPage(page) {
  const prop = page.properties && page.properties.user;
  if (!prop) return null;
  if (prop.type === 'title' && prop.title.length) return prop.title[0].plain_text;
  if (prop.type === 'rich_text' && prop.rich_text.length) return prop.rich_text[0].plain_text;
  return null;
}

// 팀원 전체의 Notion 페이지 마지막 수정 시각을 한 번에 조회한다.
// sync-meta.json(이 서버를 통해 업로드한 기록)은 master가 이 앱으로 업로드했을 때만
// 남는데, 멤버는 이 앱으로 업로드하는 개념 자체가 없어 항상 "기록 없음"으로 보였다.
// Notion이 실제로 관리하는 last_edited_time을 쓰면 누가 어떤 경로로 갱신했든
// (다른 서버 인스턴스, Notion 앱에서 직접 등) 정확한 마지막 수정 시각을 보여줄 수 있다.
app.get('/notion-status', async (req, res) => {
  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    if (!database.data_sources || database.data_sources.length === 0) {
      return res.json({});
    }
    const dataSourceId = database.data_sources[0].id;
    const query = await notion.dataSources.query({ data_source_id: dataSourceId });

    const result = {};
    query.results.forEach((page) => {
      const userId = extractUserIdFromPage(page);
      if (userId) {
        result[userId] = page.last_edited_time;
      }
    });
    res.set('Cache-Control', 'no-store');
    res.json(result);
  } catch (e) {
    console.error('[notion-status] failed:', e.message || e);
    res.status(500).json({ error: 'failed to load notion status', details: e.message || String(e) });
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

// config.json 의 상단바 로고 텍스트(logoText) 값 변경
app.post('/config/logo-text', (req, res) => {
	const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, 12) : '';

	try {
		const cfgPath = path.join(__dirname, 'config.json');
		const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
		cfg.logoText = text;
		fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 4) + '\n', 'utf8');
		config.logoText = text; // 메모리상 config 동기화
		res.json({ message: 'logo text updated', text });
	} catch (e) {
		console.error('Error updating logo text:', e);
		res.status(500).json({ error: 'failed to update logo text', details: e.message });
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
