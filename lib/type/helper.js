"use strict";

var _ = require( "lodash" );
var log = require( "fm-log" ).module();
var TypeInfo = require( "./info.js" );

var TypeHelper = (function() {
	/**
	 * Construct a new instance of a TypeHelper.
	 * @param {TypeInfo} typeInfo The type information instance for the type of the instance.
	 * @constructor
	 */
	function TypeHelper( typeInfo ) {
		this.typeInfo = typeInfo;
	}

	/**
	 * Removes fields from an instance which are set to null.
	 * @param {Object|Object[]} instance The instance of the type on which operations should be performed.
	 * @param {Boolean} [clone=false] Should the operation be performed on a copy of the instance instead?
	 * @returns {*} The instance with the null fields removed.
	 */
	TypeHelper.prototype.omitNull = function( instance, clone ) {
		if( null === instance ) {
			throw new Error( "Type instance cannot be null!" );
		}
		var targetInstance = ( clone ) ? _.clone( instance ) : instance;

		// Handle arrays.
		if( Array.isArray( instance ) ) {
			var helper = this;
			var results = [];
			instance.forEach( function( element ) {
				results.push( helper.omitNull( element, clone ) );
			} );
			return results;
		}

		// Handle generic objects.
		for( var propertyName in targetInstance ) {
			// If the property is marked null, delete it.
			if( targetInstance[ propertyName ] === null ) {
				delete targetInstance[ propertyName ];
			}
		}
		return targetInstance;
	};

	/**
	 * Removes hidden fields from an instance of the type.
	 * @param {Object|Object[]} instance The instance of the type on which operations should be performed.
	 * @param {String} [userClass="user"] The user class for which to check the hidden attribute.
	 * @param {Boolean} [clone=false] Should the operation be performed on a copy of the instance instead?
	 * @returns {*} The instance with the hidden fields removed.
	 */
	TypeHelper.prototype.omitHidden = function( instance, userClass, clone ) {
		if( null === instance ) {
			throw new Error( "Type instance cannot be null!" );
		}
		userClass = ( "undefined" === typeof userClass ) ? TypeInfo.USERCLASS_USER : userClass;
		var targetInstance = ( clone ) ? _.clone( instance ) : instance;

		// Handle arrays.
		if( Array.isArray( instance ) ) {
			var helper = this;
			var results = [];
			instance.forEach( function( element ) {
				results.push( helper.omitHidden( element, userClass, clone ) );
			} );
			return results;
		}

		// Handle generic objects.
		for( var propertyName in targetInstance ) {
			// If the property is marked hidden, delete it.
			if( this.typeInfo.isHidden( propertyName, userClass ) ) {
				delete targetInstance[ propertyName ];
			}
			// If the property is marked complex...
			if( this.typeInfo.isComplex( propertyName ) ) {
				// ...retrieve the name of the referenced type...
				var complexTypeName = this.typeInfo.complex( propertyName );
				// ...and then retrieve the type itself.
				var complexType = TypeInfo.types[ complexTypeName ];
				if( complexType ) {
					// Omit the hidden members of the complex type from the target instance.
					complexType.typehelper.omitHidden( targetInstance[ propertyName ], userClass, false );
				} else {
					log.warn( "Property '" + propertyName + "' marked as complex, referencing '" + complexTypeName + "', but the type is unknown." );
				}
			}
		}
		return targetInstance;
	};

	/**
	 * Removes read-only fields from an instance of the type.
	 * @param {Object|Object[]} instance The instance of the type on which operations should be performed.
	 * @param {String} [userClass="user"] The user class for which to check the readonly attribute.
	 * @param {Boolean} [clone=false] Should the operation be performed on a copy of the instance instead?
	 * @returns {*} The instance with the read-only fields removed.
	 */
	TypeHelper.prototype.omitReadOnly = function( instance, userClass, clone ) {
		if( null === instance ) {
			throw new Error( "Type instance cannot be null!" );
		}
		userClass = ( "undefined" === typeof userClass ) ? TypeInfo.USERCLASS_USER : userClass;
		var targetInstance = ( clone ) ? _.clone( instance ) : instance;

		// Handle arrays.
		if( Array.isArray( instance ) ) {
			var helper = this;
			var results = [];
			instance.forEach( function( element ) {
				results.push( helper.omitReadOnly( element, userClass, clone ) );
			} );
			return results;
		}

		// Handle generic objects.
		for( var propertyName in targetInstance ) {
			// If the property is marked read-only, remove it from the instance.
			if( this.typeInfo.isReadOnly( propertyName, userClass ) ) {
				delete targetInstance[ propertyName ];
			}
			// If the property is marked as complex...
			if( this.typeInfo.isComplex( propertyName ) ) {
				// ...retrieve the name of the referenced type...
				var complexTypeName = this.typeInfo.complex( propertyName );
				/// ...and then retrieve the type itself.
				var complexType = TypeInfo.types[ complexTypeName ];
				if( complexType ) {
					// Omit the read-only members of the complex type from the target instance.
					complexType.typehelper.omitReadOnly( targetInstance[ propertyName ], userClass, false );
				} else {
					log.warn( "Property '" + propertyName + "' marked as complex, referencing '" + complexTypeName + "', but the type is unknown." );
				}
			}
		}
		return targetInstance;
	};

	/**
	 * Replaces concealed fields from an instance of the type.
	 * @param {Object|Object[]} instance The instance of the type on which operations should be performed.
	 * @param {String} [userClass="user"] The user class for which to check the concealed attribute.
	 * @param {Boolean} [clone=false] Should the operation be performed on a copy of the instance instead?
	 * @param {*} [concealWith=true] The value to replace the original value with.
	 * @returns {*} The instance with the concealed fields replaced.
	 */
	TypeHelper.prototype.conceal = function( instance, userClass, clone, concealWith ) {
		if( null === instance ) {
			throw new Error( "Type instance cannot be null!" );
		}
		userClass = ( "undefined" === typeof userClass ) ? TypeInfo.USERCLASS_USER : userClass;
		concealWith = ( "undefined" === typeof concealWith ) ? true : concealWith;
		var targetInstance = ( clone ) ? _.clone( instance ) : instance;

		// Handle arrays.
		if( Array.isArray( instance ) ) {
			var helper = this;
			var results = [];
			instance.forEach( function( element ) {
				results.push( helper.omitReadOnly( element, userClass, clone ) );
			} );
			return results;
		}

		// Handle generic objects.
		for( var propertyName in targetInstance ) {
			// If the property is marked as concealed, conceal it.
			if( this.typeInfo.isConcealed( propertyName, userClass ) ) {
				targetInstance[ propertyName ] = concealWith;
			}
			// If the property is marked as complex...
			if( this.typeInfo.isComplex( propertyName ) ) {
				// ...retrieve the name of the referenced type...
				var complexTypeName = this.typeInfo.complex( propertyName );
				/// ...and then retrieve the type itself.
				var complexType = TypeInfo.types[ complexTypeName ];
				if( complexType ) {
					// Conceal the concealed members of the complex type in the target instance.
					complexType.typehelper.conceal( targetInstance[ propertyName ], userClass, false, concealWith );
				} else {
					log.warn( "Property '" + propertyName + "' marked as complex, referencing '" + complexTypeName + "', but the type is unknown." );
				}
			}
		}
		return targetInstance;
	};

	/**
	 * Replaces complex type instances with their ID.
	 * @param {Object|Object[]} instance The instance of the type on which operations should be performed.
	 * @param {Boolean} [clone=false] Should the operation be performed on a copy of the instance instead?
	 * @returns {*} The instance with the complex fields replaced.
	 */
	TypeHelper.prototype.reduceComplex = function( instance, clone ) {
		if( null === instance ) {
			throw new Error( "Type instance cannot be null!" );
		}
		var targetInstance = ( clone ) ? _.clone( instance ) : instance;

		// Handle arrays.
		if( Array.isArray( instance ) ) {
			var helper = this;
			var results = [];
			instance.forEach( function( element ) {
				results.push( helper.reduceComplex( element, clone ) );
			} );
			return results;
		}

		for( var propertyName in targetInstance ) {
			if( !this.typeInfo.isComplex( propertyName ) ) {
				reduceObject( targetInstance[ propertyName ] );
			}
		}

		return targetInstance;

		function reduceObject( entity, depth ) {
			if( 10 < depth ) {
				log.error( "Entity nesting too deep! Complex reduction can not be completed." );
				return null;
			}

			for( var propertyName in entity ) {
				if( !entity.hasOwnProperty( propertyName ) ) {
					continue;
				}

				if( Array.isArray( entity[ propertyName ] ) ) {
					entity[ propertyName ] = reduceObject( entity[ propertyName ], depth + 1 );
					continue;
				}

				if( entity[ propertyName ] && entity[ propertyName ].id ) {
					entity[ propertyName ] = entity[ propertyName ].id;
					continue;
				}
			}
			return entity[ propertyName ];
		}
	};

	return TypeHelper;
})();

module.exports = TypeHelper;
