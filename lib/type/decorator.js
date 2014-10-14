"use strict";

var log = require( "fm-log" ).module();
var util = require( "util" );

var TypeDecorator = (function() {
	function TypeDecorator( typeDescription ) {
		this.typeDescription = typeDescription;
	}

	function internalDecorate( typeDescription, propertyName, userClass, attribute ) {
		typeDescription[ propertyName ][ "info" ] = typeDescription[ propertyName ][ "info" ] || {};
		typeDescription[ propertyName ][ "info" ][ userClass ] = typeDescription[ propertyName ][ "info" ][ userClass ] || [];

		if( util.isArray( attribute ) ) {
			typeDescription[ propertyName ][ "info" ][ userClass ] =
				typeDescription[ propertyName ][ "info" ][ userClass ].concat( attribute );
		} else {
			typeDescription[ propertyName ][ "info" ][ userClass ].push( attribute );
		}
	}

	/**
	 * Decorate a property in a type with a certain attribute.
	 * @param propertyName
	 * @param userClass
	 * @param attribute
	 */
	TypeDecorator.prototype.decorate = function( propertyName, userClass, attribute ) {
		if( typeof this.typeDescription[ propertyName ] == "undefined" ) {
			log.warn( "Unable to decorate non-existent property '" + propertyName + "'." );
			return this;
		}

		internalDecorate( this.typeDescription, propertyName, userClass, attribute );

		return this;
	}

	TypeDecorator.prototype.decorateDeep = function() {
		if( arguments.length < 3 ) {
			log.error( "Too few arguments to decorateDeep(). Expected property path, user class and attribute." );
			return this;
		}

		var args = Array.prototype.slice.call( arguments, 0 );
		var attribute = args[ args.length - 1 ];
		var userClass = args[ args.length - 2 ];
		var propertyPath = args.splice( 0, args.length - 2 );

		var decorate = Function.prototype;
		propertyPath.reduce( function( object, index ) {
			if( !object.hasOwnProperty( index ) ) {
				object[ index ] = {};
			}
			decorate = function() {
				internalDecorate( object, index, userClass, attribute );
			}
			return object[ index ];
		}, this.typeDescription );
		decorate();

		return this;
	}

	return TypeDecorator;
})();

module.exports = TypeDecorator;
