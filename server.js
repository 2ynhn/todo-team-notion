// process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const express = require('express');
const { Client } = require('@notionhq/client');
const { exec } = require('child_process');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const https = require('https');
const fs = require('fs');
const app = express();
const port = 4000;
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


// Notion rich_text 2000자 제한을 우회하는 함수
function splitTextIntoChunks(text, maxLength = 1900) {
  const chunks = [];
  for (let i = 0; i < text.length; i += maxLength) {
    chunks.push(text.substring(i, i + maxLength));
  }
  return chunks;
}

// rich_text 배열로 변환
function createRichTextArray(text) {
  const chunks = splitTextIntoChunks(text);
  return chunks.map(chunk => ({
    text: { content: chunk }
  }));
}

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
    
    // 4) 2000자 제한 체크 및 분할
    console.log(`JSON length: ${jsonString.length} characters`);
    
    const richTextArray = createRichTextArray(jsonString);
    console.log(`Split into ${richTextArray.length} chunks`);

    // 5) 페이지 업데이트
    await notion.pages.update({
      page_id: pageId,
      properties: {
        value: {
          rich_text: richTextArray,
        },
      },
    });

    res.json({ 
      message: 'updated', 
      user: userId,
      totalLength: jsonString.length,
      chunks: richTextArray.length 
    });
  } catch (e) {
    console.error('Error updating todos:', e);
    res.status(500).json({ 
      error: 'failed to update todos',
      details: e.message 
    });
  }
});

// GET 함수 수정 (여러 chunk를 합쳐서 반환)
app.get('/todos/:userId', async (req, res) => {
  const userId = req.params.userId;
  console.log('load user: ' + userId);

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
      },
    });

    if (query.results.length === 0) {
      return res.status(404).json({ message: 'user row not found' });
    }

    const page = query.results[0];
    const valueProp = page.properties.value;

    // 여러 chunk를 합쳐서 하나의 문자열로 만듦
    const rawText = valueProp.rich_text && valueProp.rich_text.length > 0
      ? valueProp.rich_text.map(chunk => chunk.plain_text).join('')
      : '[]';

    console.log(`Retrieved ${rawText.length} characters from ${valueProp.rich_text?.length || 0} chunks`);

    const todos = JSON.parse(rawText);
    res.json({ user: userId, todos });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'failed to load todos' });
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

// 커밋 로그 실행 요청을 처리하는 API 엔드포인트
app.get('/run-commit-log', (req, res) => {
	// 실제 셸 스크립트가 있는 경로를 지정합니다.
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
	// console.log(req.body);
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
