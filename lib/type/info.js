"use strict";

var TypeInfo = (function() {
	/**
	 * Construct a new TypeInfo instance from a type description.
	 * @param {Object} typeDescription The type description. This is usually the
	 * same structure you create the mongoose schema from.
	 * @constructor
	 */
	function TypeInfo( typeName, typeDescription ) {
		// An identifier that is supposed to uniquely identify the type being described.
		this.typeName = typeName.toLowerCase();

		this.typeDescription = typeDescription;
		this.typeInfo = {};

		for( var propertyName in typeDescription ) {
			var propertyInfo = this.parsePropertyDescription( typeDescription[ propertyName ] );
			if( propertyInfo ) {
				this.typeInfo[ propertyName ] = propertyInfo;
			}
			/*
			 if( typeDescription[ propertyName ].hasOwnProperty( "info" ) ) {
			 this.typeInfo[ propertyName ] = typeDescription[ propertyName ].info;
			 }
			 if( typeDescription[ propertyName ].hasOwnProperty( "ref" ) ) {
			 var recurse = true;
			 }
			 */
		}

		this.USERCLASS_USER = TypeInfo.USERCLASS_USER;
		this.USERCLASS_ADMIN = TypeInfo.USERCLASS_ADMIN;
	}

	/**
	 * Check if a given type name is a valid match for the name of this type.
	 * @param {String} typeName The name of the type.
	 * @returns {boolean}
	 */
	TypeInfo.prototype.is = function( typeName ) {
		return this.typeName === typeName.toLowerCase();
	};

	TypeInfo.prototype.parsePropertyDescription = function( property ) {
		if( Array.isArray( property ) ) {
			return this.parsePropertyDescription( property[ 0 ] );
		}
		if( property.hasOwnProperty( "info" ) ) {
			return property.info;
		}
		if( property.hasOwnProperty( "ref" ) ) {
			// If the property is a reference to another type, store the name of the referenced type and mark the result as a complex type.
			var result = {};
			result[ TypeInfo.COMPLEX ] = property.ref;
			return result;
		}
		return null;
	};

	/**
	 * Determine if a given property in a type is supposed to be hidden.
	 * Hidden properties are not communicated out of the application.
	 * @param {String} propertyName The name of the property.
	 * @param {String} [accessClass="user"] The access class for which to check the read-only attribute.
	 * @returns {Boolean} true if the property is marked as hidden; false otherwise.
	 */
	TypeInfo.prototype.isHidden = function( propertyName, accessClass ) {
		accessClass = ( "undefined" === typeof accessClass ) ? TypeInfo.USERCLASS_USER : accessClass;
		return (
		this.typeInfo.hasOwnProperty( propertyName ) &&
		this.typeInfo[ propertyName ].hasOwnProperty( accessClass ) &&
		-1 < this.typeInfo[ propertyName ][ accessClass ].indexOf( TypeInfo.HIDDEN )
		);
	};

	/**
	 * Determine if a given property in a type is supposed to be read-only.
	 * Read-only properties are not persisted to the database when they enter the application.
	 * @param {String} propertyName The name of the property.
	 * @param {String} [accessClass="user"] The access class for which to check the read-only attribute.
	 * @returns {Boolean} true if the property is marked as read-only; false otherwise.
	 */
	TypeInfo.prototype.isReadOnly = function( propertyName, accessClass ) {
		// Concealed properties are always read-only.
		if( this.isConcealed( propertyName, accessClass ) ) {
			return true;
		}

		accessClass = ( "undefined" === typeof accessClass ) ? TypeInfo.USERCLASS_USER : accessClass;
		return (
		this.typeInfo.hasOwnProperty( propertyName ) &&
		this.typeInfo[ propertyName ].hasOwnProperty( accessClass ) &&
		-1 < this.typeInfo[ propertyName ][ accessClass ].indexOf( TypeInfo.READ_ONLY )
		);
	};

	/**
	 * Determine if a given property in a type is supposed to be concealed.
	 * Concealed properties are supposed to have their values replaced before leaving the application.
	 * Concealed properties are inherently read-only!
	 * @param {String} propertyName The name of the property.
	 * @param {String} [accessClass="user"] The access class for which to check the read-only attribute.
	 * @returns {Boolean} true if the property is marked as read-only; false otherwise.
	 */
	TypeInfo.prototype.isConcealed = function( propertyName, accessClass ) {
		accessClass = ( "undefined" === typeof accessClass ) ? TypeInfo.USERCLASS_USER : accessClass;
		return (
		this.typeInfo.hasOwnProperty( propertyName ) &&
		this.typeInfo[ propertyName ].hasOwnProperty( accessClass ) &&
		-1 < this.typeInfo[ propertyName ][ accessClass ].indexOf( TypeInfo.CONCEALED )
		);
	};

	/**
	 * Determine if the given property is marked as complex (references another type).
	 * @param {String} propertyName The name of the property to check.
	 * @returns {boolean} true if the property is complex; false otherwise.
	 */
	TypeInfo.prototype.isComplex = function( propertyName ) {
		return (
		this.typeInfo.hasOwnProperty( propertyName ) &&
		this.typeInfo[ propertyName ].hasOwnProperty( TypeInfo.COMPLEX )
		);
	};
	/**
	 * Returnes the complex (referenced) type.
	 * Assumes that the given property is marked as complex.
	 * @param {String} propertyName The name of the property that contains the complex type reference.
	 * @returns {*}
	 */
	TypeInfo.prototype.complex = function( propertyName ) {
		return this.typeInfo[ propertyName ][ TypeInfo.COMPLEX ];
	};

	/**
	 * The read-only attribute.
	 * @type {string}
	 */
	TypeInfo.READ_ONLY = "readonly";

	/**
	 * The hidden attribute.
	 * @type {string}
	 */
	TypeInfo.HIDDEN = "hidden";

	/**
	 * The complex marker.
	 * This marker is used internally when a property is a reference to another type.
	 * @type {string}
	 */
	TypeInfo.COMPLEX = "complex";

	/**
	 * The concealed attribute.
	 * @type {string}
	 */
	TypeInfo.CONCEALED = "concealed";

	/**
	 * The access class for a user of the application.
	 * @type {string}
	 */
	TypeInfo.USERCLASS_USER = "user";

	/**
	 * The access class for users of the admin area.
	 * @type {string}
	 */
	TypeInfo.USERCLASS_ADMIN = "admin";

	/**
	 * An array into which types can (and should) store their type-related data.
	 * The data stored in it should be identical to the object that is return by require()ing the module of the type.
	 * This array is intended as a convenience lookup by a type name.
	 * @type {Array}
	 */
	TypeInfo.types = [];

	return TypeInfo;
})();

module.exports = TypeInfo;
