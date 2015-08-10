var ACSP = require('./index');
var debug = require('debug')('test');


var a = ACSP({host: '127.0.0.1', port: 11000});

var listeners = 0;
a.on('newListener', function(){
	listeners++;
	debug('added a listener, now have %s listeners', listeners);
})

a.on('removeListener', function(){
	listeners--;
	debug('removed a listener, now have %s listeners', listeners);
})

console.log('starting test!');

a.on('car_info', function(carinfo){
	debug('CARINFO', carinfo);
});

a.on('new_session', function(sessioninfo){
	debug('SESSIONINFO', sessioninfo);
});

a.on('car_update', function(carupdate){
	debug('CARUPDATE', carupdate);
});



 // for (var i = 0; i < 10; i++) {
 //  	//a.getCarInfo(i);
 //  	a.sendChat(i,'You are car '+i);
 // }

//a.sendChat(1,'Hi');

a.enableRealtimeReport(0);

// a.getCarInfo(0).then(function(info){
// 	debug('Got info for car 0:', info)
// })

a.on('lap_completed',function(lapinfo){
	debug('lapinfo',lapinfo);
});

//a.on('client_event',function(client_event_info){
//	debug('CEI',client_event_info);
//});

a.on('connection_closed',function(cc){
	debug('CC',cc);
});

a.on('new_connection',function(cc){
	debug('CC',cc);
});

a.on('collide_env',function(client_event_info){
	debug('COL_ENV',client_event_info);

})
a.on('collide_car',function(client_event_info){
	debug('COL_CAR',client_event_info);
})

a.on('end_session',function(data){
	debug('end_session', data);
});

a.on('session_info',function(data){
	debug('session_info',data);
});

a.getSessionInfo(0);
a.getSessionInfo(1);
a.getSessionInfo(2);

a.getCarInfo(0);

a.broadcastChat('Hello World!');
