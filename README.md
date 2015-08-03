# ACSP - Assetto Corsa Server Protocol
Uses the UDP Plugin feature of Assetto Corsa v1.2+ to get realtime reports on car positions, collisions, lap times and more...

## Install
```npm install acsp```

## Usage
```js
var ACSP = require('acsp');

var a = ACSP({
  host: 'localhost',
  port: 11000
});

// listen for car_info events
a.on('car_info', function(carinfo){
	console.log(carinfo);
});

// request car_info for car #0
a.getCarInfo(0);
```

## Events
* ```car_info``` sent in response to a ```.getCarInfo()``` call
* ```new_session``` triggered when a new session starts
* ```end_session``` triggered when a session ends **(see note below)**
* ```collide_env``` triggered when a car collides with the environment
* ```collide_car``` triggered when a car collides with another car
* ```car_update``` triggered every ```x``` milliseconds after calling ```.enableRealtimeReport(x)```
* ```new_connection``` a new driver has connected
* ```connection_closed``` a driver has disconnected
* ```lap_completed``` a car has completed a lap

## Methods
* ```.getCarInfo(car_id)``` request car_info for car_id
* ```.enableRealtimeReport(ms)``` request realtime car updates every ```ms``` milliseconds
* ```.sendChat(car_id, msg)``` send a chat message ```msg``` to driver ```car_id```
* ```.broadcastChat(msg)``` send a chat message ```msg``` to all connected drivers
