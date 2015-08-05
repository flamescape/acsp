var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
// var Iconv  = require('iconv').Iconv;
// var iconv = new Iconv('UTF-32LE', 'UTF-8');
var debug = require('debug')('acsp');
var BufferReader = require('buffer-reader');
// var codepage = require('codepage');
var _ = require('lodash')
var Promise = require('bluebird');

/**
 * ACSP Constructor
 * @param {object} options
 */
function ACSP(options) {
    var self = this;

    this.options = options;
    this.sock = dgram.createSocket(this.options.sockType)

    this.sock.on('error', function(err){
        // pass socket errors to main
        self.emit('error', err);
    });

    this.sock.on('message', function(msg, rinfo){
        //debug('MESSAGE', msg, rinfo);
        self._handleMessage(new BufferReader(msg), rinfo);
    });

    this.sock.bind(12000);
}

// allow this prototype to emit events
ACSP.prototype.__proto__ = EventEmitter.prototype;

// define some constants
ACSP.NEW_SESSION               = 50;
ACSP.NEW_CONNECTION            = 51;
ACSP.CONNECTION_CLOSED         = 52;
ACSP.CAR_UPDATE                = 53;
ACSP.CAR_INFO                  = 54; // Sent as response to ACSP_GET_CAR_INFO command
ACSP.END_SESSION               = 55;
ACSP.LAP_COMPLETED             = 73;
// EVENTS
ACSP.CLIENT_EVENT              = 130;
// EVENT TYPES
ACSP.CE_COLLISION_WITH_CAR     = 10;
ACSP.CE_COLLISION_WITH_ENV     = 11;
// COMMANDS
ACSP.REALTIMEPOS_INTERVAL      = 200;
ACSP.GET_CAR_INFO              = 201;
ACSP.SEND_CHAT                 = 202; // Sends chat to one car
ACSP.BROADCAST_CHAT            = 203; // Sends chat to everybody 

ACSP.prototype.getCarInfo = function(carId){
    var buf = new Buffer(100);
    buf.fill(0);
    buf.writeUInt8(ACSP.GET_CAR_INFO, 0);
    buf.writeUInt8(carId, 1);
    //debug('BUFFER', buf);
    this._send(buf);

    var self = this;
    var handler;

    return new Promise(function(resolve, reject){
        handler = function(car_info){
            if (car_info.car_id === carId) {
                resolve(car_info);
                self.removeListener('car_info', handler);
            }
        };

        self.on('car_info', handler);
    }).timeout(1000).catch(function(err){
        self.removeListener('car_info', handler);
        throw err;
    });
}

ACSP.prototype.enableRealtimeReport = function(interval){
    var buf = new Buffer(100);
    buf.fill(0);
    buf.writeUInt8(ACSP.REALTIMEPOS_INTERVAL,0);
    buf.writeUInt16LE(interval,1)
    this._send(buf);
}

ACSP.prototype.sendChat = function(carid, message){
    var buf = new Buffer(255);
    buf.fill(0);
    buf.writeUInt8(ACSP.SEND_CHAT, 0);
    buf.writeUInt8(carid, 1);
    this.writeStringW(buf, message, 2);
    //debug('BUFFER', buf);
    this._send(buf);
}

ACSP.prototype.broadcastChat = function(message){
    var buf = new Buffer(255);
    buf.fill(0);
    buf.writeUInt8(ACSP.BROADCAST_CHAT, 0);
    this.writeStringW(buf, message, 1);
    //debug(buf);
    this._send(buf);
}

/**
 * [private] Send packet to AC server
 * @param  {Buffer} buff Contents of the message
 * @return {undefined}
 */
ACSP.prototype._send = function(buf) {
    //debug('buflen', buf.length);
    this.sock.send(buf, 0, buf.length, this.options.port, this.options.host);
};

/**
 * [private] Parse an incoming message and emit appropriate events
 * @param  {Buffer} msg   Message content
 * @param  {object} rinfo Information about the sender
 * @return {undefined}
 */
ACSP.prototype._handleMessage = function(msg, rinfo) {
    var packet_id = msg.nextUInt8();

    switch (packet_id) {
        case ACSP.NEW_SESSION:
            this.emit('new_session',{
                name: this.readString(msg),
                type: msg.nextUInt8(),
                time: msg.nextUInt16LE(),
                laps: msg.nextUInt16LE(),
                wait_time: msg.nextUInt16LE(),
                ambient_temp: msg.nextUInt8(),
                road_temp: msg.nextUInt8(),
                weather_graphics: this.readString(msg)
            });
            break;
        case ACSP.END_SESSION:
            debug('end session packet!');
            this.emit('end_session',{
                filename: this.readStringW(msg)
            });
            break;
        case ACSP.CLIENT_EVENT:
            var client_event = {
                ev_type: msg.nextUInt8(),
                car_id: msg.nextUInt8(),                              
            }
            if(client_event.ev_type == ACSP.CE_COLLISION_WITH_CAR){
                client_event.other_car_id = msg.nextUInt8();
            }
            _.extend(client_event, {
                speed: msg.nextFloatLE(),
                world_pos: this.readVector3f(msg),
                rel_pos: this.readVector3f(msg)
            })

            this.emit('client_event',client_event);
            if (client_event.ev_type == ACSP.CE_COLLISION_WITH_ENV){
               this.emit('collide_env',client_event);
            } else if(client_event.ev_type == ACSP.CE_COLLISION_WITH_CAR) {
                this.emit('collide_car',client_event);
            }
            break;
        case ACSP.CAR_INFO:
            this.emit('car_info', {
                car_id: msg.nextUInt8(),
                is_connected: msg.nextUInt8(),
                car_model: this.readStringW(msg),
                car_skin: this.readStringW(msg),
                driver_name: this.readStringW(msg),
                driver_team: this.readStringW(msg),
                driver_guid: this.readStringW(msg)
            });
            break;
        case ACSP.CAR_UPDATE:
            this.emit('car_update',{
                car_id: msg.nextUInt8(),
                pos: this.readVector3f(msg),
                velocity: this.readVector3f(msg),
                gear: msg.nextUInt8(),
                engine_rpm: msg.nextUInt16LE(),
                normalized_spline_pos: msg.nextFloatLE()
            });
            break;
        case ACSP.NEW_CONNECTION:
            var conn_info = {
                driver_name: this.readStringW(msg),
                driver_guid: this.readStringW(msg),
                car_id: msg.nextUInt8(),
                car_model: this.readString(msg),
                car_skin: this.readString(msg)
            };

            this.emit('new_connection', conn_info);

            var self = this;

            this.pollUntilStatusKnown(conn_info.car_id).then(function(isConnected){
                if (isConnected) {
                    self.emit('is_connected', conn_info.car_id);
                } else {
                    self.emit('connection_closed', conn_info);
                }
            });
            break;
        case ACSP.CONNECTION_CLOSED:
            this.emit('connection_closed',{
                driver_name: this.readStringW(msg),
                driver_guid: this.readStringW(msg),
                car_id: msg.nextUInt8(),
                car_model: this.readString(msg),
                car_skin: this.readString(msg)
            });
            break;
        case ACSP.LAP_COMPLETED:
            var lapinfo = {
                car_id: msg.nextUInt8(),
                laptime: msg.nextUInt32LE(),
                cuts: msg.nextUInt8(),
                cars_count: msg.nextUInt8()
            };

            lapinfo.leaderboard = [];
            for (var i = 0; i < lapinfo.cars_count; i++) {
                lapinfo.leaderboard.push({
                    rcar_id: msg.nextUInt8(),
                    rtime: msg.nextUInt32LE(),
                    rlaps: msg.nextUInt8()
                })
            }
            lapinfo.grip_level = msg.nextFloatLE();
            this.emit('lap_completed', lapinfo)
            break;
        default:
            debug('Unrecognised message', packet_id, 'MSG:', msg);
            break;
    }
};

ACSP.prototype.pollCarStatus = function(car_id){
    var self = this;

    return this.getCarInfo(car_id).cancellable().then(function(info){
        if (!info.is_connected) {
            return Promise.delay(1000).then(function(){
                return self.pollCarStatus(car_id);
            });
        }

        return true;
    });
}

ACSP.prototype.pollUntilStatusKnown = function(car_id){
    var pollPromise = this.pollCarStatus(car_id);

    var handler;
    var self = this;

    handler = function(conn_info){
        if (conn_info === car_id) {
            pollPromise.cancel(Error('Connection reset'));
        }
    };

    this.on('new_connection', handler);
    this.on('connection_closed', handler);

    return pollPromise.catch(function(err){
        debug('Poll promise error:', err);
        return false;
    }).finally(function(){
        self.removeListener('new_connection', handler);
        self.removeListener('connection_closed', handler);
    });
};

ACSP.prototype.writeStringW = function(buf, str, offset){
	buf.writeUInt8(str.length, offset);
	// hacky method that ignores half the UTF-32 space
	buf.write(str.split('').join('\u0000') + '\u0000', offset + 1, str.length * 4, 'utf-16le');
}

ACSP.prototype.readString = function(buf) {
    var length = buf.nextUInt8();
    var strBuf = buf.nextBuffer(length);
    // var str = iconv.convert(strBuf).toString('utf8');
    // return codepage.utils.decode(12000, buf);
    return strBuf.toString('utf8');
    // return str;
}

ACSP.prototype.readStringW = function(buf) {
    var length = buf.nextUInt8();
    var strBuf = buf.nextBuffer(length*4);
    // var str = iconv.convert(strBuf).toString('utf8');
    // return codepage.utils.decode(12000, buf);
    return strBuf.toString('utf-16le').split('\u0000').join('');
    // return str;
}

ACSP.prototype.readVector3f = function (buf){
    return {
        x: buf.nextFloatLE(),
        y: buf.nextFloatLE(),
        z: buf.nextFloatLE()
    };
}

/**
 * Close the ACSP socket and try not to cause any memory leaks
 * @return {undefined}
 */
ACSP.prototype.close = function(){
    this.socket.removeAllListeners();
    this.socket.unref();
};

module.exports = ACSP;
