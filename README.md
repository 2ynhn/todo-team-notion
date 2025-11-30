# todo-team-notion
- node, express를 이용한 멀티 유저 todo 매니저. DB 없이 notion API를 이용해서 나의 todo를 notion에 업로드하고 팀원의 todo도 실시간으로 로딩합니다.
- Multi-user todo manager built with Node.js and Express. Uploads your todos to Notion and loads team members' todos in real-time using Notion API, without a database.

## Node modules 설치 : package.json 에 있는 모듈들이 설치 됩니다.
```
$ npm install
```

## Notion 에서 데이터베이스 페이지 생성 및 API 연결
- 새 데이터베이스 페이지 생성
- "Aa 이름" > "Aa user" 로 변경
- "+ 속성추가" > "value" 추가 (유형: 텍스트)
- 개발자 도구에서 data-block-id 값 찾아서 기록. config.json의 notionID 값에 사용
- API 통합 개발에서 새 intergration 생성. key값은 config.json의 notionAPI 값에 사용
- 데이터베이스 페이지에 생성한 intergration 연결

## 루트 디렉토리에 config.json 수정
- 각 user의 id, name, role 을 작성합니다.
- 본인의 id에는 role 이 master, 그 외에는 member입니다.
- notionID : API를 연결 한 페이지의 테이블 ID
- notionAPI : API 통합 개발에서 생성한 API의 키
- theme : 기본 css이외에 추가 할 css (optional)
- limit : 내 todo 목록 노출 개수 지정 (optional)
- uploadLastDay : 내 todo 업로드 시 오늘부터 n 일 까지만 업로드 (optional)
- plugins : js 파일을 추가로 로드하도록 설정 (optional)

## 서버 실행 :
```
$ npm start
```
- 또는 server_init.bat 실행