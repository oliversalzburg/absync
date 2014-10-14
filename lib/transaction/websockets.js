"use strict";

var Server = require( "socket.io" );
var log = require( "fm-log" ).module();

var WebSocketLibrary = (function() {
	function WebSocketLibrary() {
	}

	WebSocketLibrary.prototype.configure = function( configuration ) {
		// Did we receive a socket.io instance?
		if( configuration instanceof Server ) {
			this.io = configuration;
			return;
		}

		// Is the configuration just a port number?
		if( typeof configuration == "number" ) {
			this.io = require( "socket.io" )( configuration );
			return;
		}

		// Is it a configuration hash?
		if( typeof configuration == "object" ) {
			this.io = require( "socket.io" )( configuration.port );
			return;
		}
	};

	WebSocketLibrary.prototype.emit = function( name, payload ) {
		if( null !== this.io ) {
			this.io.sockets.emit( name, payload );
		} else {
			log.warn( "Websocket transport has no socket.io configured. emit() has no effect." );
		}
	};

	return WebSocketLibrary;
})();


module.exports = new WebSocketLibrary();
