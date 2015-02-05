"use strict";

var _ = require( "lodash" );
var EventEmitter = require( "events" ).EventEmitter;
var extend = require( "mongoose-schema-extend" );
var mongoose = require( "mongoose" );
var Schema = mongoose.Schema;
var TypeHelper = require( "./helper.js" );
var TypeInfo = require( "./info.js" );
var util = require( "util" );

/**
 * Contains all the important aspects regarding a type.
 * @param {Schema} schema The schema that was used to construct the type.
 * @param {TypeInfo} typeinfo The type information container.
 * @param {Model} model The mongoose model.
 * @param {Collection} collection The mongoose collection.
 * @param {Function} populator A function that, when called, generates a random instance of the described type.
 * @constructor
 */
function Type( schema, typeinfo, model, collection, populator ) {
	this.schema = schema;
	/** @type TypeInfo */
	this.typeinfo = typeinfo;
	/** @type TypeHelper */
	this.typehelper = new TypeHelper( this.typeinfo );
	this.model = model;
	this.collection = collection;
	/** @type Function */
	this.populator = populator;
}

util.inherits( Type, EventEmitter );

/**
 * Construct a new type.
 * @param {String} typeName The name of the type. For example "Meeting".
 * @param {String} collectionName The name of the collection for the type. For example "meetings".
 * @param {Object} typeDescription An object describing all the elements in the schema of the type.
 * @param {Function} populator A function that, when called, generates a random instance of the described type.
 * @returns {Type} The type metadata container.
 */
module.exports.assemble = function( typeName, collectionName, typeDescription, populator ) {
	// Create a schema
	var schema = new Schema(
		typeDescription,
		{ collection : collectionName, discriminatorKey : "_type" }
	);
	// id should be a virtual to retrieve the object ID as a hex string.
	schema.virtual( "id" ).get( function() {
		return this._id.toHexString();
	} );
	var transformationOptions = {
		getters   : true,
		virtuals  : true,
		transform : function transformDocument( document, result, options ) {
			result.id = document._id.toHexString();
			delete result._id;
		}
	};
	schema.set( "toJSON", transformationOptions );
	schema.set( "toObject", transformationOptions );

	// Register schema as mongoose model
	mongoose.model( typeName, schema );

	var typeExports = new Type( schema,
		new TypeInfo( typeName, typeDescription ),
		mongoose.model( typeName ),
		mongoose.connection.collections[ collectionName ],
		populator );

	// Store type description in TypeInfo lookup table.
	TypeInfo.types[ typeName ] = typeExports;

	return typeExports;
};

/**
 * Extend one type with another type.
 * Extended types will share common properties and will be maintained in the same collection.
 * @param {String} typeName The name of the type. For example "IosDevice".
 * @param {String} baseName The name of the base type. For example "Device". This type must already exist.
 * @param {Object} typeDescription An object describing all the elements in the schema of the type.
 * @param {Function} populator A function that, when called, generates a random instance of the described type.
 * Note that the populator of the base type will not be invoked automatically. This should be done manually in the populator of the derived type.
 * @returns {Type} The type metadata container for the derived type.
 */
module.exports.extend = function( typeName, baseName, typeDescription, populator ) {
	var baseTypeInfo = TypeInfo.types[ baseName ];
	if( !baseTypeInfo ) {
		throw new Error( "Invalid base type '" + baseName + "'." );
	}
	// Create a schema
	var schema = baseTypeInfo.schema.extend( typeDescription );
	// Register schema as mongoose model
	mongoose.model( typeName, schema );

	// Now extend our type description so that it covers all inherited properties.
	_.assign( typeDescription, baseTypeInfo.typeinfo.typeDescription );

	var typeExports = new Type( schema,
		new TypeInfo( typeName, typeDescription ),
		mongoose.model( typeName ),
		baseTypeInfo.collection,
		populator );

	// Store type description in TypeInfo lookup table.
	TypeInfo.types[ typeName ] = typeExports;

	return typeExports;
};

/**
 * Extend one type with another, without sharing the same collection.
 * @param {String} typeName The name of the type. For example "IosDevice".
 * @param {String} baseName The name of the base type. For example "Device". This type must already exist.
 * @param {String} collectionName The name of the collection for the type. For example "meetings".
 * @param {Object} typeDescription An object describing all the elements in the schema of the type.
 * @param {Function} populator A function that, when called, generates a random instance of the described type.
 * Note that the populator of the base type will not be invoked automatically. This should be done manually in the populator of the derived type.
 * @returns {Type} The type metadata container for the derived type.
 */
module.exports.extendWithCollection = function( typeName, baseName, collectionName, typeDescription, populator ) {
	var baseTypeInfo = TypeInfo.types[ baseName ];
	if( !baseTypeInfo ) {
		throw new Error( "Invalid base type '" + baseName + "'." );
	}
	// Create a schema
	var schema = baseTypeInfo.schema.extend( typeDescription );
	schema.options.collection = collectionName;
	// Register schema as mongoose model
	mongoose.model( typeName, schema );

	// Now extend our type description so that it covers all inherited properties.
	_.assign( typeDescription, baseTypeInfo.typeinfo.typeDescription );

	var typeExports = new Type( schema,
		new TypeInfo( typeName, typeDescription ),
		mongoose.model( typeName ),
		mongoose.connection.collections[ collectionName ],
		populator );

	// Store type description in TypeInfo lookup table.
	TypeInfo.types[ typeName ] = typeExports;

	return typeExports;
};
