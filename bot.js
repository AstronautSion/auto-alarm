
const moment = require("moment");
const keys = require('./credentials.json');
const { google, androidpublisher_v2 } = require("googleapis");
const dotenv = require("dotenv");
const http = require('http');
const schedule = require('node-schedule');
const ip = require('request-ip');

dotenv.config();
// console.log('time:', moment().format('YYYY-MM-DD hh:mm:ss'));
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.static('public'));

app.set('view engine', 'ejs');
app.set('views', './views');

// company ips Array
const processIps = process.env.CNASPLEX_IPS || [];
const myIp = processIps?.split(',');


app.get('/', (req, res) => {
	if(checkIp(req)){
		res.render('index');
	}else{
		res.render('Forbidden');
	}
	
});

app.get('/addEvent', (req, res) => {


	if(checkIp(req)){
		botEvent(function(data){
			res.json({data });
		});
	}else{
		res.json({msg: '외부 IP 차단.'})
	}
});

// '0,0,0,0' IPV4 setting
app.listen(port, '0.0.0.0', () => console.log(`Example app listening on port ${port}`));


function checkIp(req){
	const clientIp = ip.getClientIp(req);
	let check = false;
	myIp.map((v) => {
		if( clientIp == v){
			check = true;
		}
	});
	return check;
}



function botEvent(callback){
	const client = new google.auth.JWT( keys.client_email, null, keys.private_key,  ['https://www.googleapis.com/auth/spreadsheets'] );
	client.authorize(function(err, tokens){
	  if (err) {
		console.log(err);
		return;
	  } else {
		console.log('connected!!');
		 gsrun(client).then((test) => {
			callback(test.data);
		});
	  }
	});
	async function gsrun(cl){
		const gsapi = google.sheets({version:'v4', auth: cl});
		let spreadsheetId = process.env.GOOGLE_SPREADSHEETS_ID;
		let range = '홈페이지 관리!A1:ZZ';
		const opt = { spreadsheetId, range, };
		let data = await gsapi.spreadsheets.values.get(opt);
		return data;
	}
 
}