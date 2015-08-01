var _ = require('lodash');
var ACSP = require('./ACSP');

module.exports = function(options){
    _.defaults(options || {}, {
        host: 'localhost',
        port: 12000,
        sockType: 'udp4'
    });

    return new ACSP(options);
}
