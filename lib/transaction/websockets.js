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

		} else if( configuration.constructor.name == "Server" ) {
			log.warn( "configuration is an instance of 'Server', but wasn't detected as socket.io instance. This indicates a possible socket.io version conflict between your application and absync! absync will probably not work." );
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
