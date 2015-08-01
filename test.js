var ACSP = require('./index');
var debug = require('debug')('test');

var a = ACSP({host: '127.0.0.1', port: 11000});

a.on('car_info', function(carinfo){
	debug('CARINFO', carinfo);
});

a.on('new_session', function(sessioninfo){
	debug('SESSIONINFO', sessioninfo);
});

a.on('car_update', function(carupdate){
	debug('CARUPDATE', carupdate);
});

 for (var i = 0; i < 10; i++) {
  	//a.getCarInfo(i);
  	a.sendChat(i,'You are car '+i);
 }

//a.sendChat(1,'Hi');

a.enableRealtimeReport(0);

a.on('lap_completed',function(lapinfo){
	debug('lapinfo',lapinfo);
});

a.on('client_event',function(client_event_info){
	debug('CEI',client_event_info);
});

a.on('connection_closed',function(cc){
	debug('CC',cc);
});

a.on('new_connection',function(cc){
	debug('CC',cc);
});

//a.broadcastChat('Hello Gareth!');

// a.broadcastChat('Hello Gareth!');
// a.broadcastChat('Hello Gareth!');