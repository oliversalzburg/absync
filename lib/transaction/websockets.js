"use strict";

// Get logger for this file
var log = require( "fm-log" ).module();

var WebSocketLibrary = {};

WebSocketLibrary.configure = function( io ) {
	this.io = io;
};

WebSocketLibrary.emit = function( name, payload ) {
	if( null !== this.io ) {
		this.io.sockets.emit( name, payload );
	}
};

WebSocketLibrary.broadcastMeeting = function( meeting ) {
	if( null !== this.io ) {
		log.debug( "Broadcasting meeting record to clients." );
		this.io.sockets.emit( "meeting", { meeting : meeting } );
	}
};

WebSocketLibrary.broadcastPerson = function( person ) {
	if( null !== this.io ) {
		log.debug( "Broadcasting person record to clients." );
		this.io.sockets.emit( "person", { person : person } );
	}
};

module.exports = WebSocketLibrary;
