"use strict";
var TypeInfo = require( "./../type/info.js" );
var websockets = require( "./websockets.js" );

/**
 * Conductor is THE tool to use when sending data to any type of client.
 * It makes sure every object is a plain object (not a mongoose model) and it sanitizes the object for the target user class.
 */
var Conductor = (function() {
	function Conductor() {
	}

	/**
	 * Removes hidden properties from a payload and conceals concealed properties.
	 * @param {*} recordToProcess The record to preprocess.
	 * @param {*} recordType The module that contains type information about the record.
	 * @param {String} userClass The user class for which the preprocessing should be performed.
	 * @returns {*}
	 */
	Conductor.prototype.preProcess = function( recordToProcess, recordType, userClass ) {
		if( Array.isArray( recordToProcess ) ) {
			var conductor = this;
			var payloadCollection = [];
			recordToProcess.forEach( function( record ) {
				payloadCollection.push( conductor.preProcess( record, recordType, userClass ) );
			} );
			return payloadCollection;
		}
		// If the record is a mongoose document, convert it to a plain object.
		if( recordToProcess && typeof( recordToProcess.toObject ) == "function" ) {
			recordToProcess = recordToProcess.toObject();
		}
		// Remove properties that are null
		recordType.typehelper.omitNull( recordToProcess );
		// Remove hidden properties
		var payload = recordType.typehelper.omitHidden( recordToProcess, userClass, true );
		// Conceal properties
		recordType.typehelper.conceal( payload, userClass );

		return payload;
	};

	/**
	 * Send a record over websockets to connected clients.
	 * @param {*} recordToSend The record that should be broadcast.
	 * @param {*} recordType The module that contains type information about the record.
	 * @param {String} userClass The user class for which the preprocessing should be performed.
	 */
	Conductor.prototype.sendTo = function( recordToSend, recordType, userClass ) {
		var payload = this.preProcess( recordToSend, recordType, userClass );

		var typeName = recordType.typehelper.typeInfo.typeName;
		// Wrap the payload in an object that has a property which is named after the record type.
		var payloadWrapper = {};
		payloadWrapper[ typeName ] = payload;
		websockets.emit( typeName, payloadWrapper );
	};

	/**
	 * Send a special payload that signals the deletion of an entity.
	 * @param {*} recordToSend The record that was deleted.
	 * @param {*} recordType The module that contains type information about the record.
	 */
	Conductor.prototype.sendDeletion = function( recordToSend, recordType ) {
		var payload = { id:recordToSend.id};

		var typeName = recordType.typehelper.typeInfo.typeName;
		// Wrap the payload in an object that has a property which is named after the record type.
		var payloadWrapper = {};
		payloadWrapper[ typeName ] = payload;
		websockets.emit( typeName, payloadWrapper );
	}

	/**
	 * Respond to a request with a record.
	 * @param {*} recordToSend The record that should be broadcast.
	 * @param {*} recordType The module that contains type information about the record.
	 * @param {String} userClass The user class for which the preprocessing should be performed.
	 * @param {*} response The express response object to use for sending the response to the client.
	 */
	Conductor.prototype.respondTo = function( recordToSend, recordType, userClass, response ) {
		var payload = this.preProcess( recordToSend, recordType, userClass );

		var typeName = recordType.typehelper.typeInfo.typeName;
		// Wrap the payload in an object that has a property which is named after the record type.
		var payloadWrapper = {};
		payloadWrapper[ typeName ] = payload;
		response.json( payloadWrapper );
	};

	/**
	 * Convenience function that implies broadcasting to users.
	 * @param {*} recordToSend The record that should be broadcast.
	 * @param {*} recordType The module that contains type information about the record.
	 */
	Conductor.prototype.sendToUsers = function( recordToSend, recordType ) {
		this.sendTo( recordToSend, recordType, TypeInfo.USERCLASS_USER );
	};

	/**
	 * DO NOT USE! Convenience function that implies broadcasting to admins.
	 * If a connected websocket belongs to a certain user class can NOT be determined!
	 * @param {*} recordToSend The record that should be broadcast.
	 * @param {*} recordType The module that contains type information about the record.
	 */
	Conductor.prototype.sendToAdmins = function( recordToSend, recordType ) {
		throw new Error( "not supported" );
		//this.sendTo( recordToSend, recordType, TypeInfo.USERCLASS_ADMIN );
	};

	/**
	 * Convenience function that implies responding to a user.
	 * @param {*} recordToSend The record that should be broadcast.
	 * @param {*} recordType The module that contains type information about the record.
	 * @param {*} response The express response object to use for sending the response to the client.
	 */
	Conductor.prototype.respondToUser = function( recordToSend, recordType, response ) {
		this.respondTo( recordToSend, recordType, TypeInfo.USERCLASS_USER, response );
	};

	/**
	 * Convenience function that implies responding to an admin.
	 * @param {*} recordToSend The record that should be broadcast.
	 * @param {*} recordType The module that contains type information about the record.
	 * @param {*} response The express response object to use for sending the response to the client.
	 */
	Conductor.prototype.respondToAdmin = function( recordToSend, recordType, response ) {
		this.respondTo( recordToSend, recordType, TypeInfo.USERCLASS_ADMIN, response );
	};
	return Conductor;
})();


module.exports = new Conductor();
