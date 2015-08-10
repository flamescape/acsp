var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;
var debug = require('debug')('acsp');
var BufferReader = require('buffer-reader');
var BufferWriter = require('buffer-write');
var _ = require('lodash')
var Promise = require('bluebird');
var PromiseQueue = require('promise-queue');
PromiseQueue.configure(Promise);

/**
 * Create a "wide" string from a regular JS string
 * @param {string} str
 * @return {Buffer}
 */
function StringW(str) {
    if (typeof str !== "string") {
        // Ensure we're operating on a string.
        str = "" + str;
    }
    if (str.length > 255) {
        // Sorry, "wide" strings can only be up to 255 characters;
        // The remainder will be truncated.
        str = str.substr(0, 255);
    }
    var buf = new Buffer((str.length * 4) + 1);
    buf.writeUInt8(str.length, 0);
    
    if (str.length > 0) {
        // Hacky method that ignores half the UTF-32 space
        buf.write(str.split('').join('\u0000') + '\u0000', 1, str.length * 4, 'utf-16le');
    }

    return buf;
}

/**
 * ACSP Constructor
 * @param {object} options
 */
function ACSP(options) {
    var self = this;

    this.options = options;
    this.sock = dgram.createSocket(this.options.sockType);
    Promise.promisifyAll(this.sock);

    // Message send queue
    this.sendQueue = new PromiseQueue(1, Infinity);

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
ACSP.VERSION                   = 56;
ACSP.CHAT                      = 57;
ACSP.CLIENT_LOADED             = 58;
ACSP.SESSION_INFO              = 59;
ACSP.ERROR                     = 60;
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
ACSP.GET_SESSION_INFO          = 204;
ACSP.SET_SESSION_INFO          = 205;
ACSP.KICK_USER                 = 206;
// ACSP.VERSION                   = 0; // Not implemented

ACSP.prototype.getCarInfo = function(carId){

    var buf = BufferWriter()
        .writeUInt8(ACSP.GET_CAR_INFO)
        .writeUInt8(carId)
        .toBuffer();

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
    }).timeout(1000).finally(function(){
        self.removeListener('car_info', handler);
    });
}

ACSP.prototype.getSessionInfo = function(sess_index){    

    // sess_index is optional
    if (typeof sess_index === 'undefined') {
        sess_index = -1;
    }

    var buf = BufferWriter()
        .writeUInt8(ACSP.GET_SESSION_INFO)
        .writeInt16LE(sess_index)
        .toBuffer();

    this._send(buf);

    var self = this;
    var handler;

    return new Promise(function(resolve, reject){
        handler = function(session_info){
            if (session_info.sess_index === sess_index
            || (sess_index === -1 && session_info.sess_index === session_info.current_session_index)) {
                resolve(session_info);
                self.removeListener('session_info', handler);
            }
        };

        self.on('session_info', handler);
    }).timeout(1000).finally(function(){
        self.removeListener('session_info', handler);
    });

}

ACSP.prototype.setSessionInfo = function(sessioninfo){

    var buf = BufferWriter()
        .writeUInt8(ACSP.SET_SESSION_INFO)
        .writeUInt8(sessioninfo.sess_index)   // Session Index
        .write(StringW(sessioninfo.name))     // Session Name
        .writeUInt8(sessioninfo.type)         // Session type
        .writeUInt32LE(sessioninfo.laps)      // Laps
        .writeUInt32LE(sessioninfo.time)      // Time (in seconds)
        .writeUInt32LE(sessioninfo.wait_time) // Wait time (in seconds)
        .toBuffer();

    return this._send(buf);
}

ACSP.prototype.enableRealtimeReport = function(interval){

    var buf = BufferWriter()
        .writeUInt8(ACSP.REALTIMEPOS_INTERVAL)
        .writeUInt16LE(interval)
        .toBuffer();

    return this._send(buf);
}

ACSP.prototype.sendChat = function(carid, message){

    var buf = BufferWriter()
        .writeUInt8(ACSP.SEND_CHAT)
        .writeUInt8(carid)
        .write(StringW(message))
        .toBuffer();
    
    return this._send(buf);
}

ACSP.prototype.broadcastChat = function(message){

    var buf = BufferWriter()
        .writeUInt8(ACSP.BROADCAST_CHAT)
        .write(StringW(message))
        .toBuffer();
    
    return this._send(buf);
}

ACSP.prototype.kickUser = function(car_id){

    var buf = new BufferWriter()
        .writeUInt8(ACSP.KICK_USER)
        .writeUInt8(car_id)
        .toBuffer();

    return this._send(buf);
}

ACSP.prototype.getVersion = function(){
    
    return this.getSessionInfo().then(function(info){
        return info.version;
    });

}

/**
 * [private] Send packet to AC server
 * @param  {Buffer} buf Contents of the message
 * @return {Promise} resolved when message is sent
 */
ACSP.prototype._send = function(buf) {
    var self = this;
    //debug('buflen', buf.length);
    return this.sendQueue.add(function(){
        return self.sock.sendAsync(buf, 0, buf.length, self.options.port, self.options.host);
    });
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
        case ACSP.CHAT:
            this.emit('chat_message',{
                    car_id: msg.nextUInt8(),
                    message: this.readStringW(msg)
            });
            break; 
        case ACSP.CLIENT_LOADED:
            var car_id = msg.nextUInt8();
            this.emit('client_loaded',car_id);
            break;
        case ACSP.VERSION:
            // TODO: Do something with this??
            var version = msg.nextUInt8();
            this.emit('version', version);
            break;        
        case ACSP.NEW_SESSION:
        case ACSP.SESSION_INFO:         
            var session_info = {
                version: msg.nextUInt8(),
                sess_index: msg.nextUInt8(),
                current_session_index: msg.nextUInt8(),
                session_count: msg.nextUInt8(),

                server_name: this.readStringW(msg),
                track: this.readString(msg),
                track_config: this.readString(msg),
                name: this.readString(msg),
                type: msg.nextUInt8(),
                time: msg.nextUInt16LE(),
                laps: msg.nextUInt16LE(),
                wait_time: msg.nextUInt16LE(),
                ambient_temp: msg.nextUInt8(),
                road_temp: msg.nextUInt8(),
                weather_graphics: this.readString(msg),
                elapsed_ms: msg.nextInt32LE()
            }; 
            this.emit('version',session_info.version);
            this.emit('session_info',session_info);            
            if(packet_id == ACSP.NEW_SESSION){ this.emit('new_session',session_info);}
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

            // var self = this;

            // this.pollUntilStatusKnown(conn_info.car_id).then(function(isConnected){
            //     if (isConnected) {
            //         self.emit('is_connected', conn_info.car_id);
            //     } else {
            //         self.emit('connection_closed', conn_info);
            //     }
            // });
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
        case ACSP.ERROR:
            debug('ERROR', 'MSG:', this.readStringW(msg));
            break;
        default:
            debug('Unrecognised message', packet_id, 'MSG:', msg);
            break;
    }
};

ACSP.prototype.readString = function(buf) {
    var length = buf.nextUInt8();
    var strBuf = buf.nextBuffer(length);
    return strBuf.toString('utf8');
}

ACSP.prototype.readStringW = function(buf) {
    var length = buf.nextUInt8();
    var strBuf = buf.nextBuffer(length*4);
    return strBuf.toString('utf-16le').split('\u0000').join('');
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
