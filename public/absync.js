var absync;
(function( _absync, undefined ) {
	"use strict";

	/**
	 * Please make note of the following variable naming conventions:
	 * 1. Function-scope local variables must be prefixed with a single underscore.
	 *    This indicates a temporary variable.
	 * 2. Variables that are persisted onto publicly accessible entities must be prefixed with two underscores.
	 *    This indicates a private variable.
	 *    Hiding private variables, by using closures, is discouraged.
	 */

	angular
		.module( "absync" )
		.provider( "absync", getAbsyncProvider );

	/* @ngInject */
	function getAbsyncProvider( $injector, $provide ) {
		var _absyncProvider = this;

		_absyncProvider.__ioSocket = null;
		// If socket.io was not connected when a service was constructed, we put the registration request
		// into this array and register it as soon as socket.io is configured.
		_absyncProvider.__registerLater = [];

		// The collections that absync provides.
		_absyncProvider.__collections = {};

		// Register the configurator on the provider itself to allow early configuration during setup phase.
		_absyncProvider.configure = function AbsyncProvider$configure( configuration ) {
			var socket = configuration.socket || configuration;
			if( typeof socket == "function" ) {
				// Assume io
				_absyncProvider.__ioSocket = socket();

			} else if( io && io.Socket && socket instanceof io.Socket ) {
				// Assume io.Socket
				_absyncProvider.__ioSocket = socket;

			} else {
				throw new Error( "configure() expects input to be a function or a socket.io Socket instance." );
			}

			// Check if services already tried to register listeners, if so, register them now.
			if( _absyncProvider.__registerLater.length ) {
				angular.forEach( _absyncProvider.__registerLater, function registerListener( listener ) {
					this.__handleEntityEvent( listener.eventName, listener.callback, listener.rootScope );
				} );
				_absyncProvider.__registerLater = [];
			}
		};

		// Request a new synchronized collection.
		// This only registers the intent to use that collection. It will be constructed when it is first used.
		_absyncProvider.collection = function AbsyncProvider$collection( name, configuration ) {
			if( _absyncProvider.__collections[ name ] ) {
				throw new Error( "A collection with the name '" + name + "' was already requested. Names for collections must be unique." );
			}

			// Register the service configuration.
			_absyncProvider.__collections[ name ] = absyncCacheServiceFactoryFactory( name, configuration );
			;
			_absyncProvider.__collections[ name ].configuration = configuration;
			_absyncProvider.__collections[ name ].isConstructed = false;

			// Register the new service.
			$provide
				.factory( name, _absyncProvider.__collections[ name ] );
		};

		// Register the service factory.
		/* @ngInject */
		_absyncProvider.$get = function absyncProvider$$get( $rootScope ) {
			return new AbsyncService( this, $rootScope );
		};
	}

	/**
	 * The service that is received when injecting "absync".
	 * This service is primarily used internally to set up the connection between socket.io and the individual
	 * caching services.
	 * @param {Object} parentProvider The AbsyncProvider that provides this service.
	 * @param {Object} rootScope The Angular root scope.
	 * @constructor
	 */
	function AbsyncService( parentProvider, rootScope ) {
		this.__absyncProvider = parentProvider;
		this.__rootScope = rootScope;
	}

	/**
	 * Configure the socket.io connection for absync.
	 * @param configuration
	 */
	AbsyncService.prototype.configure = function AbsyncService$configure( configuration ) {
		var _absyncProvider = this.__absyncProvider;
		_absyncProvider.configure( configuration );
	};

	/**
	 * Register an event listener that is called when a specific entity is received on the websocket.
	 * @param eventName
	 * @param callback
	 */
	AbsyncService.prototype.on = function AbsyncService$on( eventName, callback ) {
		var _absyncProvider = this.__absyncProvider;
		var _absyncService = this;

		if( !_absyncProvider.__ioSocket ) {
			_absyncProvider.__registerLater.push( {
				eventName : eventName,
				callback  : callback,
				rootScope : _absyncProvider.__rootScope
			} );
			return;
		}

		this.__handleEntityEvent( eventName, callback, _absyncService.__rootScope );
	};

	/**
	 * Convenience method to allow the user to emit() from the websocket.
	 * This is not utilized in absync internally.
	 * @param eventName
	 * @param data
	 * @param callback
	 */
	AbsyncService.prototype.emit = function AbsyncService$emit( eventName, data, callback ) {
		var _absyncProvider = this.__absyncProvider;

		if( !_absyncProvider.ioSocket ) {
			throw new Error( "socket.io is not initialized." );
		}

		var _rootScope = this.rootScope;

		_absyncProvider.__ioSocket.emit( eventName, data, function afterEmit() {
			var args = arguments;
			_rootScope.$apply( function() {
				if( callback ) {
					callback.apply( _absyncProvider.ioSocket, args );
				}
			} );
		} );
	};

	/**
	 * Handle receiving an entity on the websocket connection.
	 * @param eventName
	 * @param callback
	 * @param rootScope
	 * @returns {Function}
	 */
	AbsyncService.prototype.__handleEntityEvent = function AbsyncService$__handleEntityEvent( eventName, callback, rootScope ) {
		var _absyncProvider = this.__absyncProvider;

		var wrapper = function() {
			var args = arguments;
			rootScope.$apply( function() {
				callback.apply( _absyncProvider.__ioSocket, args );
			} );
		};
		_absyncProvider.__ioSocket.on( eventName, wrapper );

		// Return a function that removes the listener.
		// TODO: This is not currently utilized due to the delayed listener registration approach.
		return function removeListener() {
			_absyncProvider.__ioSocket.removeListener( eventName, wrapper );
		};
	};

	/**
	 * This is a factory, which returns a absyncCacheServiceFactory.
	 * The absyncCacheServiceFactory will then return the actual absyncCacheService.
	 * @param name
	 * @param configuration
	 * @returns {absyncCacheServiceFactory}
	 */
	function absyncCacheServiceFactoryFactory( name, configuration ) {
		return absyncCacheServiceFactory;

		/* @ngInject */
		function absyncCacheServiceFactory( $http, $injector, $log, $q, $rootScope,  absync ) {
			var cacheService = this;
			$log.info( "absync service for '" + configuration.collectionName + "' was instantiated." );

			var _injector = configuration.injector || $injector;
			var _injectorHasModel = _injector.has( configuration.model );
			if( !_injectorHasModel ) {
				throw new Error( "Unable to construct the '" + name + "' service, because the referenced model '" + configuration.model + "' is not available for injection." );
			}
			var _model = _injector.get( configuration.model );

			var deserializeModel = _model.deserialize || configuration.deserialize || serializationNoop;

			cacheService.name = configuration.collectionName;

			cacheService.entityCache = [];
			cacheService.entityCacheRaw = null;

			cacheService.dataAvailableDeferred = cacheService.dataAvailableDeferred || $q.defer();
			cacheService.objectsAvailableDeferred = cacheService.objectsAvailableDeferred || $q.defer();
			cacheService.dataAvailable = cacheService.dataAvailableDeferred.promise;
			cacheService.objectsAvailable = cacheService.objectsAvailableDeferred.promise;

			cacheService.httpInterface = $http;
			cacheService.fromJson = deserializeModel;

			cacheService.ensureLoaded = function( forceReload ) {
				forceReload = (forceReload === true);
				if( null === cacheService.entityCacheRaw || forceReload ) {
					cacheService.entityCacheRaw = [];

					if( !configuration.collectionName || !configuration.collectionUri ) {
						return $q( true )
					}
					$log.info( "Retrieving '" + configuration.collectionName + "' collection…" );
					cacheService.httpInterface.get( configuration.collectionUri )
						.then( function( peopleResult ) {
							cacheService.entityCacheRaw = peopleResult.data;
							cacheService.dataAvailableDeferred.resolve( peopleResult.data );
						},
						function( error ) {
							cacheService.entityCacheRaw = null;
							$rootScope.$emit( "authorizationError", error );
						} );
				}

				return $q.all( [ cacheService.dataAvailable,
					cacheService.objectsAvailable ] );
			};

			cacheService.dataAvailable
				.then( function( rawData ) {
					cacheService.entityCache = cacheService.entityCache || [];
					rawData[ configuration.collectionName ].forEach( function( rawEntity ) {
						cacheService.entityCache.push( cacheService.fromJson( rawEntity ) );
					} );
					cacheService.objectsAvailableDeferred.resolve( cacheService.entityCache );
					$rootScope.$broadcast( "collectionNew", {
						service : cacheService,
						cache   : cacheService.entityCache
					} );
				} );

			/**
			 * Read a single entity from the cache, or load it from the server if required.
			 * @param {String} id The ID of the entity to retrieve.
			 * @returns {adapter.deferred.promise|*|defer.promise|eventObject.promise|promise|Q.promise}
			 */
			cacheService.read = function( id ) {
				var deferred = $q.defer();

				// Check if the entity is in the cache and return instantly if found.
				for( var entityIndex = 0, entity = cacheService.entityCache[ 0 ], cacheSize = cacheService.entityCache.length;
				     entityIndex < cacheSize;
				     ++entityIndex, entity = cacheService.entityCache[ entityIndex ] ) {
					if( entity.id == id ) {
						deferred.resolve( entity );
						return deferred.promise;
					}
				}

				// Grab the entity from the backend.
				cacheService.httpInterface.get( configuration.entityUri + "/" + id ).success( onEntityRetrieved );
				function onEntityRetrieved( data ) {
					if( !data[ configuration.entityName ] ) {
						deferred.reject( new Error( "The requested entity could not be found in the database." ) );
						return deferred.promise;
					}

					var entity = cacheService.fromJson( data[ configuration.entityName ] );
					updateCacheWithEntity( entity );
					deferred.resolve( entity );
				}

				return deferred.promise;
			};

			/**
			 * Updates an entity and persists it to the backend and the cache.
			 * @param {Object} entity
			 */
			cacheService.update = function( entity ) {
				var promise;

				// Wrap entity in a new object, with a single property, named after the entity type.
				var wrapper = {};
				wrapper[ configuration.entityName ] = cacheService.reduceComplex( entity );

				if( "undefined" !== typeof( entity.id ) ) {
					promise = cacheService.httpInterface.put( configuration.entityUri + "/" + entity.id, wrapper );
					promise
						.then( function( result ) {
							// Writing an entity to the backend will usually invoke an update event to be
							// broadcast over websockets, where would also retrieve the updated record.
							// We still put the updated record we receive here into the cache to ensure early consistency.
							if( result.data[ configuration.entityName ] ) {
								var newEntity = cacheService.fromJson( result.data[ configuration.entityName ] );
								updateCacheWithEntity( newEntity );
							}
						},
						function( error ) {
							$log.error( error );
						} );

				} else {
					// Create a new entity
					promise = cacheService.httpInterface.post( configuration.collectionUri, wrapper );
					promise
						.then( function( result ) {
							// Writing an entity to the backend will usually invoke an update event to be
							// broadcast over websockets, where would also retrieve the updated record.
							// We still put the updated record we receive here into the cache to ensure early consistency.
							if( result.data[ configuration.entityName ] ) {
								var newEntity = cacheService.fromJson( result.data[ configuration.entityName ] );
								updateCacheWithEntity( newEntity );
							}
						},
						function( error ) {
							$log.error( error );
						} );
				}

				return promise;
			};

			/**
			 * Creates a new entity and persists it to the backend and the cache.
			 */
			cacheService.create = cacheService.update;

			/**
			 * Remove an entity from the cache and have it deleted on the backend.
			 * @param {Object} entity
			 */
			cacheService.delete = function( entity ) {
				var deferred = $q.defer();

				var entityId = entity.id;
				cacheService.httpInterface.delete( configuration.entityUri + "/" + entityId )
					.success( function( data, status, headers, config ) {
						removeEntityFromCache( entityId );
						deferred.resolve();
					} )
					.error( function( data, status, headers, config ) {
						$log.error( data );
						deferred.reject( new Error( "Unable to delete entity." ) );
					} );

				return deferred.promise;
			};

			/**
			 * Put an entity into the cache or update the existing record if the entity was already in the cache.
			 * @param {Object} entityToCache
			 */
			function updateCacheWithEntity( entityToCache ) {
				$log.info( "Updating entity in cache..." );
				var found = false;
				for( var entityIndex = 0, entity = cacheService.entityCache[ 0 ], cacheSize = cacheService.entityCache.length;
				     entityIndex < cacheSize;
				     ++entityIndex, entity = cacheService.entityCache[ entityIndex ] ) {
					if( entity.id == entityToCache.id ) {
						$rootScope.$broadcast( "beforeEntityUpdated",
							{
								service : cacheService,
								cache   : cacheService.entityCache,
								entity  : cacheService.entityCache[ entityIndex ],
								updated : entityToCache
							} );
						// Use the "copyFrom" method on the entity, if it exists, otherwise use naive approach.
						var targetEntity = cacheService.entityCache[ entityIndex ];
						if( targetEntity.copyFrom ) {
							targetEntity.copyFrom( entityToCache );
						} else {
							angular.extend( targetEntity, entityToCache );
						}

						found = true;
						$rootScope.$broadcast( "entityUpdated",
							{
								service : cacheService,
								cache   : cacheService.entityCache,
								entity  : cacheService.entityCache[ entityIndex ]
							} );
						break;
					}
				}

				// If the entity wasn't found in our records, it's a new entity.
				if( !found ) {
					cacheService.entityCache.push( entityToCache );
					$rootScope.$broadcast( "entityNew", {
						service : cacheService,
						cache   : cacheService.entityCache,
						entity  : entityToCache
					} );
				}
			}

			/**
			 * Removes an entity from the internal cache. The entity is not removed from the backend.
			 * @param {String} id The ID of the entity to remove from the cache.
			 */
			function removeEntityFromCache( id ) {
				for( var entityIndex = 0, entity = cacheService.entityCache[ 0 ], cacheSize = cacheService.entityCache.length;
				     entityIndex < cacheSize;
				     ++entityIndex, entity = cacheService.entityCache[ entityIndex ] ) {
					if( entity.id == id ) {
						$rootScope.$broadcast( "beforeEntityRemoved", {
							service : cacheService,
							cache   : cacheService.entityCache,
							entity  : entity
						} );
						cacheService.entityCache.splice( entityIndex, 1 );
						$rootScope.$broadcast( "entityRemoved", {
							service : cacheService,
							cache   : cacheService.entityCache,
							entity  : entity
						} );
						break;
					}
				}
			}

			/**
			 * Retrieve an associative array of all cached entities, which uses the ID of the entity records as the key in the array.
			 * @returns {Array}
			 */
			cacheService.lookupTableById = function() {
				//TODO: Keep a copy of the lookup table and only update it when the cached data updates
				var lookupTable = [];
				for( var entityIndex = 0, cacheSize = cacheService.entityCache.length; entityIndex < cacheSize; ++entityIndex ) {
					lookupTable[ cacheService.entityCache[ entityIndex ].id ] = cacheService.entityCache[ entityIndex ];
				}
				return lookupTable;
			};

			/**
			 * Reduce instances of complex types within an entity with their respective IDs.
			 * Note that no type checks are being performed. Every nested object with an "id" property is treated as a complex type.
			 * @param {Object} entity The entity that should have its complex member reduced.
			 * @param {Boolean} [arrayInsteadOfObject=false] true if the manipulated entity is an array; false if it's an object.
			 * @returns {Object|Array} A copy of the input entity, with complex type instances replaced with their respective ID.
			 */
			cacheService.reduceComplex = function( entity, arrayInsteadOfObject ) {
				var result = arrayInsteadOfObject ? [] : {};
				for( var propertyName in entity ) {
					if( !entity.hasOwnProperty( propertyName ) ) {
						continue;
					}

					// Recurse for nested arrays.
					if( Array.isArray( entity[ propertyName ] ) ) {
						result[ propertyName ] = cacheService.reduceComplex( entity[ propertyName ], true );
						continue;
					}

					// Replace complex type with its ID.
					if( entity[ propertyName ] && entity[ propertyName ].id ) {
						result[ propertyName ] = entity[ propertyName ].id;
						continue;
					}

					// Just copy over the plain property.
					result[ propertyName ] = entity[ propertyName ];
				}
				return result;
			};

			/**
			 * Populate references to complex types in an instance.
			 * @param {Object} entity The entity that should be manipulated.
			 * @param {String} propertyName The name of the property of entity which should be populated.
			 * @param {Object} cache An instance of another caching service that can provide the complex
			 * type instances which are being referenced in entity.
			 * @param {Boolean} [force=false] If true, all complex types will be replaced with references to the
			 * instances in cache; otherwise, only properties that are string representations of complex type IDs will be replaced.
			 * @returns {Promise}
			 */
			cacheService.populateComplex = function( entity, propertyName, cache, force ) {
				// If the target property is an array, ...
				if( Array.isArray( entity[ propertyName ] ) ) {
					// ...map the elements in the array to promises.
					var promises = entity[ propertyName ].map( function mapElementToPromise( element, index ) {
						// We usually assume the properties to be strings (the ID of the referenced complex).
						if( typeof entity[ propertyName ][ index ] !== "string" ) {
							// If "force" is enabled, we check if this non-string property is an object and has an "id" member, which is a string.
							if( force && typeof entity[ propertyName ][ index ] === "object" && typeof entity[ propertyName ][ index ].id === "string" ) {
								// If that is true, then we replace the whole object with the ID and continue as usual.
								entity[ propertyName ][ index ] = entity[ propertyName ][ index ].id;
							} else {
								return $q.when( false );
							}
						}

						// Treat the property as an ID and read the complex with that ID from the cache.
						return cache.read( entity[ propertyName ][ index ] )
							.then( function onComplexRetrieved( complex ) {
								// When the complex was retrieved, store it back into the array.
								entity[ propertyName ][ index ] = complex;
							} )
					} );

					return $q.all( promises );
				} else {
					// We usually assume the properties to be strings (the ID of the referenced complex).
					if( typeof entity[ propertyName ] !== "string" ) {
						// If "force" is enabled, we check if this non-string property is an object and has an "id" member, which is a string.
						if( force && typeof entity[ propertyName ] === "object" && typeof entity[ propertyName ].id === "string" ) {
							// If that is true, then we replace the whole object with the ID and continue as usual.
							entity[ propertyName ] = entity[ propertyName ].id;
						} else {
							return $q.when( false );
						}
					}

					// Treat the property as an ID and read the complex with that ID from the cache.
					return cache.read( entity[ propertyName ] )
						.then( function onComplexRetrieved( complex ) {
							// When the complex was retrieved, store it back into the entity.
							entity[ propertyName ] = complex;
						} );
				}
			};

			// Listen for entity broadcasts. These are sent when a record is received through a websocket.
			$rootScope.$on( configuration.entityName, function( event, args ) {
				var entityReceived = args;

				// Determine if the received record consists ONLY of an id property,
				// which would mean that this record was deleted from the backend.
				if( 1 == Object.keys( entityReceived ).length && entityReceived.hasOwnProperty( "id" ) ) {
					$log.info( "Entity was deleted from the server. Updating cache..." );
					removeEntityFromCache( entityReceived.id );
				} else {
					updateCacheWithEntity( cacheService.fromJson( entityReceived ) );
				}
			} );
			$rootScope.$on( configuration.collectionName, function( event, args ) {
				var collectionReceived = args;

				// Clear current cache before importing collection
				while( 0 < cacheService.entityCache.length ) {
					cacheService.entityCache.pop();
				}

				collectionReceived.forEach( function addEntityToCache( entityReceived ) {
					updateCacheWithEntity( cacheService.fromJson( entityReceived ) );
				} );
			} );


			absync.on( configuration.entityName, function( message ) {
				$rootScope.$broadcast( configuration.entityName, message[ configuration.entityName ] );
			} );
			absync.on( configuration.collectionName, function( message ) {
				$rootScope.$broadcast( configuration.collectionName, message[ configuration.collectionName ] );
			} );

			/*
			if( then ) {
				// Use setTimeout to break possible dependency loops when "then" references the caching service that we just constructed.
				setTimeout( then );
			}
			*/

			return cacheService;
		}
	}

	function serializationNoop( model ) {
		return model;
	}

	/**
	 * Constructs a new caching module for a certain entity and the collection thereof.
	 * The result will be an Angular service which caches the collection and makes sure it stays in sync with the backend.
	 * The collection name and entity name must be used in the whole codebase when referring to these entities and the collection.
	 * For example, for the "person" record, the module would listen for "person" events broadcasted on the root scope. It will expect those messages
	 * to include a Person instance which should be put into the cache.
	 * @param {String} collectionName The name of the data collection. This will also be the name of the generated Angular service.
	 * When an API endpoint returns the connected collection, the returned JSON object is expected to contain the collection within a member of this name.
	 * @param {String} entityName The name of a single entity inside the collection.
	 * When an API endpoint returns a member of the collection, the returned JSON object is expected to contain the entity within a member of this name.
	 * @param {String} entityUri The URI from which a single entity of the collection can be retrieved.
	 * @param {String} collectionUri The URI from which the collection can be retrieved.
	 * @param {Function} [fromJson] A function that can convert a JSON instance of one member of the collection into a proper object.
	 */
	_absync.CacheServiceFactory = function cache( collectionName, entityName, collectionUri, entityUri, fromJson ) {

		var builder = {};




		/**
		 * Force construction of Angular service.
		 */
		builder.assembleNow = function() {
			angular.element( document ).ready( forceConstruction );
			function forceConstruction() {
				var injector = angular.element( document.body ).injector();
				injector.invoke( [ collectionName, angular.noop ] );
			}
		};

		return builder;
	};
}( absync || (absync = {}) ));
