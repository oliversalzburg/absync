var absync;
(function( _absync, undefined ) {
	"use strict";

	var absyncModule;

	try {
		absyncModule = angular.module( "absync" );
	} catch( ignored ) {
		absyncModule = angular.module( "absync", [] );
	}

	absyncModule.provider( "absync", function() {
		var absyncProvider = this;
		var ioSocket;

		absyncProvider.configure = function( configuration ) {
			if( typeof configuration == "function" && typeof configuration.connect == "function" ) {
				// Assume io
				ioSocket = configuration();
				return;
			}

			if( io && io.Socket && configuration instanceof io.Socket ) {
				// Assume io.Socket
				ioSocket = configuration;
				return;
			}
		};

		absyncProvider.$get = {};
		absyncProvider.$get.$inject = [ "$rootScope" ];
		absyncProvider.$get = function( $rootScope ) {
			return {
				on   : function( eventName, callback ) {
					var wrapper = function() {
						var args = arguments;
						$rootScope.$apply( function() {
							callback.apply( ioSocket, args );
						} );
					};
					ioSocket.on( eventName, wrapper );
					return function() {
						ioSocket.removeListener( eventName, wrapper );
					};
				},
				emit : function( eventName, data, callback ) {
					ioSocket.emit( eventName, data, function() {
						var args = arguments;
						$rootScope.$apply( function() {
							if( callback ) {
								callback.apply( ioSocket, args );
							}
						} );
					} );
				}
			};
		}
	} );

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

		if( !fromJson ) {
			fromJson = function( instance ) {
				return instance;
			}
		}

		builder.assemble = function( then, inModule ) {
			inModule = inModule || "absync";
			angular.module( inModule )
				.factory(
				collectionName,
				[ "$q", "$rootScope", "$http", "$log", "absync",
					function( $q, $rootScope, $http, $log, absync ) {
						var cacheService = this;

						cacheService.name = collectionName;

						cacheService.entityCache = null;
						cacheService.entityCacheRaw = null;

						cacheService.dataAvailableDeferred = cacheService.dataAvailableDeferred || $q.defer();
						cacheService.objectsAvailableDeferred = cacheService.objectsAvailableDeferred || $q.defer();
						cacheService.dataAvailable = cacheService.dataAvailableDeferred.promise;
						cacheService.objectsAvailable = cacheService.objectsAvailableDeferred.promise;

						cacheService.ensureLoaded = function() {
							if( null === cacheService.entityCacheRaw ) {
								cacheService.entityCacheRaw = [];

								$log.info( "Retrieving '" + collectionName + "' collection…" );
								$http.get( collectionUri )
									.then( function( peopleResult ) {
										cacheService.entityCacheRaw = peopleResult.data;
										cacheService.dataAvailableDeferred.resolve( peopleResult.data );
									},
									function( error ) {
										$rootScope.$emit( "authorizationError", error );
									} );
							}

							return $q.all( [ cacheService.dataAvailable,
								cacheService.objectsAvailable ] );
						};
						cacheService.ensureLoaded();

						cacheService.dataAvailable
							.then( function( rawData ) {
								cacheService.entityCache = [];
								rawData[ collectionName ].forEach( function( rawEntity ) {
									cacheService.entityCache.push( fromJson( rawEntity ) );
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

							cacheService.ensureLoaded()
								.then( function() {
									// Check if the entity is in the cache and return instantly if found.
									for( var entityIndex = 0, entity = cacheService.entityCache[ 0 ], cacheSize = cacheService.entityCache.length;
									     entityIndex < cacheSize;
									     ++entityIndex, entity = cacheService.entityCache[ entityIndex ] ) {
										if( entity.id == id ) {
											deferred.resolve( entity );
											return;
										}
									}

									// Grab the entity from the backend.
									$http.get( entityUri + "/" + id ).success(
										function( data ) {
											if( !data[ entityName ] ) {
												deferred.reject( new Error( "The requested entity could not be found in the database." ) );
												return;
											}

											var entity = fromJson( data[ entityName ] );
											updateCacheWithEntity( entity );
											deferred.resolve( entity );
										}
									);
								} );

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
							wrapper[ entityName ] = entity;

							if( "undefined" !== typeof( entity.id ) ) {
								promise = $http.put( entityUri + "/" + entity.id, wrapper );
								promise
									.then( function( result ) {
										// Writing an entity to the backend will usually invoke an update event to be
										// broadcast over websockets, where would also retrieve the updated record.
										// We still put the updated record we receive here into the cache to ensure early consistency.
										if( result.data[ entityName ] ) {
											var newEntity = fromJson( result.data[ entityName ] );
											updateCacheWithEntity( newEntity );
										}
									},
									function( error ) {
										$log.error( error );
									} );

							} else {
								// Create a new entity
								promise = $http.post( collectionUri, wrapper );
								promise
									.then( function( result ) {
										// Writing an entity to the backend will usually invoke an update event to be
										// broadcast over websockets, where would also retrieve the updated record.
										// We still put the updated record we receive here into the cache to ensure early consistency.
										if( result.data[ entityName ] ) {
											var newEntity = fromJson( result.data[ entityName ] );
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
							$http.delete( entityUri + "/" + entityId )
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
											entity  : cacheService.entityCache[ entityIndex ]
										} );
									cacheService.entityCache[ entityIndex ].copyFrom( entityToCache );
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

						// Listen for entity broadcasts. These are sent when a record is received through a websocket.
						cacheService.ensureLoaded().then( function() {
							$rootScope.$on( entityName, function( event, args ) {

								var entityReceived = args;

								// Determine if the received record consists ONLY of an id property,
								// which would mean that this record was deleted from the backend.
								if( 1 == Object.keys( entityReceived ).length && entityReceived.hasOwnProperty( "id" ) ) {
									$log.info( "Entity was deleted from the server. Updating cache..." );
									removeEntityFromCache( entityReceived.id );
								} else {
									updateCacheWithEntity( fromJson( entityReceived ) );
								}
							} );
						} );

						absync.on( entityName, function( message ) {
							$rootScope.$broadcast( entityName, message[ entityName ] );
						} );

						if( then ) {
							// Use setTimeout to break possible dependency loops when "then" references the caching service that we just constructed.
							setTimeout( then );
						}

						return cacheService;
					}
				]
			);
		};

		return builder;
	};
}( absync || (absync = {}) ));
