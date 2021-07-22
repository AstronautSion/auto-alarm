
const moment = require("moment");
const keys = require('./credentials.json');
const { google, androidpublisher_v2 } = require("googleapis");
const { Client } = require("@notionhq/client");
const dotenv = require("dotenv");
const http = require('http');
const schedule = require('node-schedule');

dotenv.config();
console.log('time:', moment().format('YYYY-MM-DD hh:mm:ss'));
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.set('view engine', 'ejs');
app.set('views', './views');


app.get('/', (req, res) => {
	res.render('index');
});

app.get('/addEvent', (req, res) => {
	if(req.query.pwd != '' && typeof(req.query.pwd) == 'string'){
		if(String(req.query.pwd) === String(process.env.CANSPLEX_PWD) ){
			botEvent();
			res.json({msg: '업데이트를 진행합니다.\n 업데이트 반영은 1~2분 정도 소요 될 수 있습니다.'})
		}else{
			res.json({msg: '비밀번호를 다시 확인해주세요.'})
		}
	}
});

app.listen(port, () => console.log(`Example app listening on port ${port}`));


// @ Runs every weekday (Mon ~ Fri)  at 10:00 
// heroku server와 9시간정도 차이남
const works = schedule.scheduleJob('00 00 1 * * MON-FRI', () => {
	console.log('cansplex alarm!!!');
    botEvent();
});

// 대략 9시 부터 18시 까지 매 20분 마다.
const dont_sleep = schedule.scheduleJob('*/20 0-9 * * MON-FRI', () => {
    console.log("Don't Sleep!!");
	http.get('http://cansplex-alarm.herokuapp.com/');
});



function botEvent(){

	const client = new google.auth.JWT( keys.client_email, null, keys.private_key,  ['https://www.googleapis.com/auth/spreadsheets'] );
	client.authorize(function(err, tokens){
	  if (err) {
		console.log(err);
		return;
	  } else {
		console.log('connected!!');
		gsrun(client);
	  }
	});

	const COMPARE_DAYS = 7; //비교날짜 (일주일)

	const STRING_NUMBER = '번호';
	const STRING_STATUS = '관리상태';
	const STRING_NAME = '업체명';
	const STRING_MANAGE = '담당자';
	const STRING_STATUS_END = '중단';
	const STRING_END_HOSTRING_DATE = '호스팅\n만료일';
	const STRING_END_DOMAIN_DATE = '도메인\n만료일';
	const STRING_END_COMPANY_DATE = '관리\n종료일';
	const STRING_IN_PRODUCTION = '제작중';
	const STRING_LOG = 'LOG';
	const STRING_ETC = '비고';

	const STRINGS = {
		empty: '데이터가 비어있습니다.',
		wrong: '날짜 형식이 잘못되었습니다.',
		modify: '관리 종료일이 이미 지났습니다. 확인 후 구글 스프레드시트를 수정해주세요.'
	}

	let THEAD = null;
	let KEYS_NUMBER = null;
	let KEYS_NAME = null;
	let KEYS_MANAGE = null;
	let KEYS_STATUS = null;
	let KEYS_ENDCOMPANY = null;
	let KEYS_ENDHOSTRING = null;
	let KEYS_ENDDOMAIN = null;
	let KEYS_ETC = null;


	function _findKeyNumber(string){
		let returnVal = null;
		THEAD.map(function(r,i){ 
			if(String(r) == string){
				returnVal = i; 
			}
		});
		return returnVal;
	}

	function _getThead(dataArr){
		let arr = null;
		dataArr.map(function(r){ 
			if(r[0] == STRING_NUMBER){ 
				arr = r;
			} 
		});
		return arr;
	}

	async function gsrun(cl){
		
		const gsapi = google.sheets({version:'v4', auth: cl});
		let spreadsheetId = process.env.GOOGLE_SPREADSHEETS_ID;
		let range = '홈페이지 관리!A1:ZZ';
		//let range = '홈페이지 관리!A1:U11';
		const opt = { spreadsheetId, range, };
		let data = await gsapi.spreadsheets.values.get(opt);
		let dataArray = data.data.values;

		let data_endCompany = []; //계약종료된 업체
		let data_company  = []; //계약중인 업체

		THEAD = _getThead(dataArray);
		KEYS_NUMBER = _findKeyNumber(STRING_NUMBER); //key 0 - 번호
		KEYS_STATUS = _findKeyNumber(STRING_STATUS); //key 19 - 중단인지 아닌지
		KEYS_NAME = _findKeyNumber(STRING_NAME); //key 1 - 업체명
		KEYS_MANAGE = _findKeyNumber(STRING_MANAGE); // 담당자
		KEYS_ENDCOMPANY = _findKeyNumber(STRING_END_COMPANY_DATE); //관리 종료일 key
		KEYS_ENDHOSTRING = _findKeyNumber(STRING_END_HOSTRING_DATE); //호스팅 종료일 key
		KEYS_ENDDOMAIN = _findKeyNumber(STRING_END_DOMAIN_DATE); //도메인 종료일 key
		KEYS_ETC = _findKeyNumber(STRING_ETC); //비고


		// 데이터 분기
		(function(){
			dataArray.map(function(r){
				if(r[KEYS_NUMBER] != STRING_NUMBER){
					if(r[KEYS_STATUS] == STRING_STATUS_END){ // 관리상태
						data_endCompany.push(r);	
					}else{
						data_company.push(r);
					}
				}
			});
		})();

		function _makeDateString(row, KEYS_NAME ,MODIFY_DATA, ERROR_DATA, STRING_DATE ,INPRODUCTION_DATA){
			let stringDate = row[KEYS_NAME];
			if(
				stringDate == '' ||
				typeof(stringDate) != 'string' ||
				stringDate == false
			){
				MODIFY_DATA.push({
					target: row,
					msg: STRINGS.empty,
					type: STRING_DATE,
				});
				return null;
			}

			let string = stringDate.split('.');
			
			if(string[0] && string[1] && string[2]){ // YYYY-MM-DD 형식으로 변경
				return '20'+string[0]+'-'+string[1]+'-'+string[2];
			}else{
				// string 예외처리
				if(
					stringDate != '없음' &&
					stringDate != '모름' &&
					stringDate != '병원자체관리' &&
					stringDate != '가상서버' &&
					stringDate != '서비스' &&
					stringDate != STRING_IN_PRODUCTION &&
					stringDate != '종료시까지'
				){
					// 그외 나머지는 ERROR 처리
					ERROR_DATA.push({
						target: row,
						msg: STRINGS.wrong,
						type: STRING_DATE,
					});
				}

				if(stringDate == STRING_IN_PRODUCTION){ //제작중
					INPRODUCTION_DATA.push({
						target: row,
						type: STRING_DATE,
					});
				}
				return null;
			}
		}
		
		function _checkDate(KEYS_NAME,STRING_DATE){
			const DATA = [];
			const ERROR_DATA = [];
			const MODIFY_DATA = [];
			const INPRODUCTION_DATA = [];

			data_company.map(function(r){
				let date = _makeDateString(r, KEYS_NAME, MODIFY_DATA, ERROR_DATA, STRING_DATE, INPRODUCTION_DATA);
				if(date){
					let today = moment();
					let endDate = moment(date);
					// endDate부터 endDate 7일전 날 사이에 today가 포함된다면
					if( today <= endDate && today >= endDate.subtract(COMPARE_DAYS,'days') ){
						DATA.push({
							target: r,
							value : moment.duration(today.diff(endDate)).asDays()
						});
					
					}else if(today > endDate){ //today가 endDate를 지났을경우
						MODIFY_DATA.push({
							target:r,
							msg: STRINGS.modify,
							type: STRING_DATE,
						});
					}
				}
			});

			return {
				data: DATA, 
				error: ERROR_DATA,
				modi: MODIFY_DATA,
				inproduction: INPRODUCTION_DATA,
			};
		}

		let RESULT_DATA = {
			manage : _checkDate(KEYS_ENDCOMPANY, STRING_END_COMPANY_DATE),
			domain : _checkDate(KEYS_ENDDOMAIN, STRING_END_DOMAIN_DATE),
			hosting : _checkDate(KEYS_ENDHOSTRING, STRING_END_HOSTRING_DATE),
		};

		BEFORE_DATA = JSON.parse(JSON.stringify(RESULT_DATA));
		await AND_NOTION(RESULT_DATA);
	}


	function AND_NOTION(RESULT_DATA){
		
		const notion = new Client({ auth: process.env.NOTION_KEY });
		const DB_DOMAIN = process.env.NOTION_DATABASE_ID_DOMAIN;
		const DB_HOSTRING = process.env.NOTION_DATABASE_ID_HOSTRING;
		const DB_ENDCOMPANY = process.env.NOTION_DATABASE_ID_ENDCOMPANY;
		const DB_INPRODUCTION = process.env.NOTION_DATABASE_ID_INPRODUCTION;
		const DB_LOG = process.env.NOTION_DATABASE_ID_LOG;

		async function addItem(data, database_id) {
			try {
				await notion.request({
					path: "pages",
					method: "POST",
					body: {
						parent: { database_id },
						properties: data,
					},
				})
				console.log("Success! Entry added.")
			} catch (error) {
				console.error(error.body, data);
			}
		}

		let today = moment().format('YYYY-MM-DD');
		
		function _createTableItem(type, data){
		
			function _simpleChangeDateString(stringDate){
				let string = stringDate.split('.');
				if(string[0] && string[1] && string[2]){ // check
					return '20'+string[0]+'-'+string[1]+'-'+string[2];
				}
			}
			
			let dataItem = data.target;
			if(type == STRING_END_DOMAIN_DATE){
				return {
					"알림일": {"type": "date","date": { "start": today }},
					"작업완료": {  "type": "checkbox", "checkbox": false },
					"업체명": { "type": "title", "title": [{ "type": "text", "text": { "content": String(dataItem[KEYS_NAME]) } }]},
					"도메인 만료일": {"type": "date","date": { "start": _simpleChangeDateString(dataItem[KEYS_ENDDOMAIN]) }},
					"담당자": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_MANAGE]) }}]},
					"비고": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_ETC]) || '-' }}]},
				};
			}
			if(type == STRING_END_HOSTRING_DATE){
				return {
					"알림일": {"type": "date","date": { "start":  today }},
					"작업완료": {  "type": "checkbox", "checkbox": false },
					"업체명": { "type": "title", "title": [{ "type": "text", "text": { "content": String(dataItem[KEYS_NAME]) } }]},
					"호스팅 만료일": {"type": "date","date": { "start": _simpleChangeDateString(dataItem[KEYS_ENDHOSTRING]) }},
					"담당자": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_MANAGE]) }}]},
					"비고": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_ETC]) || '-' }}]},
				}
			}
			if(type == STRING_END_COMPANY_DATE){
				return {
					"알림일": {"type": "date","date": { "start":  today }},
					"작업완료": {  "type": "checkbox", "checkbox": false },
					"업체명": { "type": "title", "title": [{ "type": "text", "text": { "content": String(dataItem[KEYS_NAME]) } }]},
					"계약 만료일": {"type": "date","date": { "start": _simpleChangeDateString(dataItem[KEYS_ENDCOMPANY]) || '0000.00.00' }},
					"담당자": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_MANAGE]) }}]},
					"비고": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_ETC]) || '-'  }}]},
				}
			}
			if(type == STRING_LOG){
				let status = '';
				let color = 'default';
				if( data.type == STRING_END_DOMAIN_DATE){ status = '도메인 만료'; color = 'yellow';}
				else if( data.type == STRING_END_HOSTRING_DATE ){ status = '호스팅 만료';  color = 'orange';}
				else if( data.type == STRING_END_COMPANY_DATE ){ status = '계약 만료'; color = 'red';}
				return {
					"알림일": {"type": "date","date": { "start": today }},
					"작업완료": { "type": "checkbox", "checkbox": false },
					"상태": { "select": {"name": status, "color": color }},
					"업체명": { "type": "title", "title": [{ "type": "text", "text": { "content": String(dataItem[KEYS_NAME]) } }]},
					"비고": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_ETC]) || '-' }}]},
					"알림봇 메세지": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(data.msg) }}]},
				}
			}
			if(type == STRING_IN_PRODUCTION){
				return {
					"알림일": {"type": "date","date": { "start":  today }},
					"작업완료": {  "type": "checkbox", "checkbox": false },
					"업체명": { "type": "title", "title": [{ "type": "text", "text": { "content": String(dataItem[KEYS_NAME]) } }]},
					"담당자": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_MANAGE]) }}]},
					"비고": {"type": "rich_text", "rich_text": [{ "type": "text", "text": { "content": String(dataItem[KEYS_ETC]) || '-'  }}]},
				}
			}
		}
		
		function pushData(datas, stringType, db){
			datas.map(function(r){
				addItem(_createTableItem(stringType, r), db);	
			});
		}
		pushData(RESULT_DATA.manage.inproduction, STRING_IN_PRODUCTION, DB_INPRODUCTION);
		pushData(RESULT_DATA.domain.data, STRING_END_DOMAIN_DATE, DB_DOMAIN);
		pushData(RESULT_DATA.hosting.data, STRING_END_HOSTRING_DATE, DB_HOSTRING);
		pushData(RESULT_DATA.manage.data, STRING_END_COMPANY_DATE, DB_ENDCOMPANY);

		// //수정요청 및 에러 데이터
		setTimeout(function(){
			pushData(RESULT_DATA.domain.modi, STRING_LOG, DB_LOG );
			pushData(RESULT_DATA.domain.error, STRING_LOG, DB_LOG );		
		}, 3000);
		setTimeout(function(){
			pushData(RESULT_DATA.hosting.modi, STRING_LOG, DB_LOG );
			pushData(RESULT_DATA.hosting.error, STRING_LOG, DB_LOG );	
		}, 6000);
		setTimeout(function(){
			pushData(RESULT_DATA.manage.modi, STRING_LOG, DB_LOG );
			pushData(RESULT_DATA.manage.error, STRING_LOG, DB_LOG );		
		}, 9000);		
	}
}