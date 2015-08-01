var dgram = require('dgram');
var EventEmitter = require('events').EventEmitter;

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
        self._handleMessage(msg, rinfo);
    });
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

/**
 * [private] Send packet to AC server
 * @param  {Buffer} buff Contents of the message
 * @return {Promise}     Promise which resolves when message is sent
 */
ACSP.prototype._send = function(buff) {

};

/**
 * [private] Parse an incoming message and emit appropriate events
 * @param  {Buffer} msg   Message content
 * @param  {object} rinfo Information about the sender
 * @return {undefined}
 */
ACSP.prototype._handleMessage = function(msg, rinfo) {

};

/**
 * Close the ACSP socket and try not to cause any memory leaks
 * @return {undefined}
 */
ACSP.prototype.close = function(){
    this.socket.removeAllListeners();
    this.socket.unref();
};

module.exports = ACSP;
