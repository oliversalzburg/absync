/* globals angular */

/**
 * Please make note of the following conventions:
 * 1. Function-scope local variables must be prefixed with a single underscore.
 *    This indicates a temporary variable.
 * 2. Private variables that are persisted onto publicly accessible entities must be prefixed with two underscores.
 *    This indicates a publicly visible, private variable.
 *    Hiding private variables, by using closures, is discouraged.
 *    Modifying these values from outside of absync is discouraged, but should be respected whenever possible.
 */

angular
	.module( "absync" )
	.constant( "absyncCache", getServiceConstructor );

/**
 * A closure to make the configuration available to the cache service.
 * @param {String} name The name of the service.
 * @param {AbsyncServiceConfiguration} configuration The configuration for this service.
 * @returns {CacheService}
 */
function getServiceConstructor( name, configuration ) {
	// There is no code here, other than the CacheService definition, followed by "return CacheService;"

	/**
	 * This service factory is the core of absync.
	 * It returns a CacheService instance that is specialized to the given configuration.
	 * This service will handle keep the stored collection in sync.
	 * @param {angular.IHttpService|Object} $http
	 * @param {angular.auto.IInjectorService|Object} $injector
	 * @param {angular.ILogService|Object} $log
	 * @param {angular.IQService|Object} $q
	 * @param {angular.IRootScopeService|Object} $rootScope
	 * @param {AbsyncProvider} absync
	 * @param {Object} absyncNoopLog A log interface that does nothing.
	 * @param {Object} absyncUncachedFilter A filter that mutates URLs so they will bypass the browser cache.
	 * @returns {CacheService}
	 * @ngInject
	 */
	function CacheService( $http, $injector, $log, $q, $rootScope, absync, absyncNoopLog, absyncUncachedFilter ) {
		var self = this;

		// Retrieve a reference to the model of the collection that is being cached.
		var _injector         = configuration.injector || $injector;
		var _injectorHasModel = _injector.has( configuration.model );
		if( !_injectorHasModel ) {
			throw new Error( "Unable to construct the '" + name + "' service, because the referenced model '" + configuration.model + "' is not available for injection." );
		}
		var _model = ( typeof configuration.model === "string" ) ? _injector.get( configuration.model ) : configuration.model;

		// Retrieve the serialization methods.
		var serializeModel   = _model.serialize || configuration.serialize || serializationNoop;
		var deserializeModel = _model.deserialize || configuration.deserialize || serializationNoop;

		// Store configuration.
		self.name          = name;
		self.configuration = configuration;

		// The entity cache must be constructed as an empty array or object, to allow the user to place watchers on it.
		// We must never replace the cache with a new array or object, we must always manipulate the existing one.
		// Otherwise watchers will not behave as the user expects them to.
		/* @type {Array<configuration.model>|configuration.model} */
		self.entityCache          = configuration.collectionName ? [] : {};
		// Create the ID -> entityIndex lookup table.
		self.entityCache.__lookup = {};
		// The raw cache is data that hasn't been deserialized and is used internally.
		self.__entityCacheRaw     = null;

		// Should request caching be used at all?
		self.enableRequestCache = true;
		// Cache requests made to the backend to avoid multiple, simultaneous requests for the same resource.
		self.__requestCache     = {};
		// When we make HTTP requests, the browser is generally allowed to cache the responses.
		// The server can control this behavior with cache control HTTPS headers.
		// However, at times it may be desirable to force the browser to always fetch fresh data from the backend.
		// This hash controls this behavior.
		self.allowBrowserCache = ( angular.merge || angular.extend )( {}, {
			// Should browser caching be allowed for initial cache sync operations?
			sync    : true,
			// Should browser caching be allowed when we retrieve single entities from the backend?
			request : true
		}, configuration.allowBrowserCache );
		self.__uncached        = absyncUncachedFilter;

		// Use $http by default and expose it on the service.
		// This allows the user to set a different, possibly decorated, HTTP interface for this service.
		self.httpInterface = $http;
		// Do the same for our logger.
		self.logInterface  = configuration.debug ? $log : absyncNoopLog;
		// The scope on which we broadcast all our relevant events.
		self.scope         = $rootScope;
		// Keep a reference to $q.
		self.q             = $q;

		// Prefix log messages with this string.
		self.logPrefix = "absync:" + name.toLocaleUpperCase() + " ";

		// If enabled, entities received in response to a create or update API call, will be put into the cache.
		// Otherwise, absync will wait for them to be published through the websocket channel.
		self.forceEarlyCacheUpdate = false;

		// Throws failures so that they can be handled outside of absync.
		self.throwFailures = true;

		// Expose the serializer/deserializer so that they can be adjusted at any time.
		self.serializer   = serializeModel;
		self.deserializer = deserializeModel;

		// Store a reference to the optional filter function.
		self.filter = configuration.filter;

		// Tell absync to register an event listener for both our entity and its collection.
		// When we receive these events, we broadcast an equal Angular event on the root scope.
		// This way the user can already peek at the data (manipulating it is discouraged though).
		absync.on( configuration.entityName, self.__onEntityOnWebsocket.bind( self ) );
		if( configuration.collectionName ) {
			absync.on( configuration.collectionName, self.__onCollectionOnWebsocket.bind( self ) );
		}

		// Now we listen on the root scope for the same events we're firing above.
		// This is where our own absync synchronization logic kicks in.
		$rootScope.$on( configuration.entityName, self.__onEntityReceived.bind( self ) );
		if( configuration.collectionName ) {
			$rootScope.$on( configuration.collectionName, self.__onCollectionReceived.bind( self ) );
		}

		self.logInterface.info( self.logPrefix + "service was instantiated." );
	}

	/**
	 * Invoked when an entity is received on a websocket.
	 * Translates the websocket event to an Angular event and broadcasts it on the scope.
	 * @param {Object} message
	 * @private
	 */
	CacheService.prototype.__onEntityOnWebsocket = function CacheService$onEntityOnWebsocket( message ) {
		var self = this;
		self.scope.$broadcast( configuration.entityName, message[ configuration.entityName ] );
	};

	/**
	 * Invoked when a collection is received on a websocket.
	 * Translates the websocket event to an Angular event and broadcasts it on the scope.
	 * @param {Object} message
	 * @private
	 */
	CacheService.prototype.__onCollectionOnWebsocket = function CacheService$onCollectionOnWebsocket( message ) {
		var self = this;
		self.scope.$broadcast( configuration.collectionName, message[ configuration.collectionName ] );
	};

	/**
	 * Event handler for when the initial badge of raw data becomes available.
	 * @param {Array<Object>|Object} rawData
	 * @private
	 */
	CacheService.prototype.__onDataAvailable = function CacheService$onDataAvailable( rawData ) {
		var self = this;

		if( Array.isArray( self.entityCache ) ) {
			// The symbol self.entityCache is expected to be an empty array.
			// We initialize it in the constructor to an empty array and we don't expect any writes to have
			// happened to it. In case writes *did* happen, we assume that whoever wrote to it knows what
			// they're doing.
			angular.forEach( rawData[ configuration.collectionName ], deserializeCollectionEntry );

			// Notify the rest of the application about a fresh collection.
			self.scope.$broadcast( "collectionNew", {
				service : self,
				cache   : self.entityCache
			} );

		} else {
			var deserialized = self.deserializer( rawData[ configuration.entityName ] );
			self.__updateCacheWithEntity( deserialized );
		}

		return self.entityCache;

		function deserializeCollectionEntry( rawEntity ) {
			var entityToCache = self.deserializer( rawEntity );
			self.entityCache.push( entityToCache );
			if( self.entityCache.__lookup ) {
				self.entityCache.__lookup[ entityToCache.id ] = self.entityCache.length - 1;
			}
		}
	};

	/**
	 * Event handler for when an entity is received on the root scope.
	 * @param {Object} event The event object.
	 * @param {Object} args The raw object as it was read from the wire.
	 * @private
	 */
	CacheService.prototype.__onEntityReceived = function CacheService$onEntityReceived( event, args ) {
		var self            = this;
		var _entityReceived = args;

		// Sometimes you don't want to use an entity cache, and only listen to websocket events.
		// In this case you don't configure an entityUri and entityUri, so received entities will be emitted directly.
		if( configuration.collectionUri === null && configuration.entityUri === null ) {

			var directResponse = {
				service : self,
				cache   : self.entityCache,
				entity  : _entityReceived
			};

			self.scope.$broadcast( "beforeEntityNew", directResponse );
			self.scope.$broadcast( "entityNew", directResponse );

			return Promise.resolve();
		}

		// Check if our raw entity cache was even initialized.
		// It's possible that it isn't, because websocket updates can be received before any manual requests
		// were made to the backend.
		if( !self.__entityCacheRaw || !self.__entityCacheRaw[ configuration.collectionName || configuration.entityName ] ) {
			// We ignore this update and just stack a new read request on top of any existing ones.
			// This makes sure that we load the freshest entity in an orderly fashion and lose the state we received
			// here, as we're getting the latest version of the entity.
			return self.ensureLoaded()
				.then( function updateEntity() {
					return self.read( _entityReceived.id );
				} );
		}

		// Determine if the received record consists ONLY of an id property,
		// which would mean that this record was deleted from the backend.
		if( 1 === Object.keys( _entityReceived ).length && _entityReceived.hasOwnProperty( "id" ) ) {
			self.logInterface.info( self.logPrefix + "Entity was deleted from the server. Updating cache…" );

			self.__cacheMaintain( self.__entityCacheRaw[ configuration.collectionName || configuration.entityName ],
				_entityReceived,
				"delete",
				false );

			return self.__removeEntityFromCache( _entityReceived.id );

		} else {
			self.logInterface.debug( self.logPrefix + "Entity was updated on the server. Updating cache…" );

			self.__cacheMaintain( self.__entityCacheRaw[ configuration.collectionName || configuration.entityName ],
				_entityReceived,
				"update",
				false );

			return self.__updateCacheWithEntity( self.deserializer( _entityReceived ) );
		}
	};

	/**
	 * Event handler for when a collection is received on the root scope.
	 * @param {Object} event The event object.
	 * @param {Array<Object>} args The raw collection as it was read from the wire.
	 * @private
	 */
	CacheService.prototype.__onCollectionReceived = function CacheService$onCollectionReceived( event, args ) {
		var self                = this;
		var _collectionReceived = args;

		// When we're receiving a full collection, all data we currently have in our cache is useless.
		// We reset the length of the array here, because assigning a new array would possibly conflict
		// with watchers placed on the original object.
		self.entityCache.length = 0;

		// Deserialize the received data and place the models in our cache.
		angular.forEach( _collectionReceived, addEntityToCache );

		function addEntityToCache( entityReceived ) {
			var deserialized = self.deserializer( entityReceived );
			self.__updateCacheWithEntity( deserialized );
		}
	};

	/**
	 * Ensure that the cached collection is retrieved from the server.
	 * @param {Boolean} [forceReload=false] Should the data be loaded, even if the service already has a local cache?
	 * @returns {Promise<Array<configuration.model>>|IPromise<Array>|IPromise<void>|Q.Promise<Array<configuration.model>>|angular.IPromise<TResult>}
	 */
	CacheService.prototype.ensureLoaded = function CacheService$ensureLoaded( forceReload ) {
		var self = this;

		forceReload = forceReload === true;
		if( forceReload ) {
			delete self.__loading;
		}

		if( self.__loading ) {
			return self.__loading;
		}

		// We only perform any loading, if we don't have raw data cached yet, or if we're forced.
		if( null === self.__entityCacheRaw || forceReload ) {
			if( !configuration.collectionName || !configuration.collectionUri ) {
				if( configuration.entityName && configuration.entityUri ) {
					self.__loading = self.httpInterface
						.get( self.allowBrowserCache.sync ? configuration.entityUri : self.__uncached(
							configuration.entityUri ) )
						.then( onSingleEntityReceived, onSingleEntityRetrievalFailure );

				} else {
					// If the user did not provide information necessary to work with a collection, immediately return
					// a promise for an empty collection. The user could still use read() to grab individual entities.
					return self.q.when( [] );
				}

			} else {
				self.logInterface.info( self.logPrefix + "Retrieving '" + configuration.collectionName + "' collection…" );
				self.__loading = self.httpInterface
					.get( self.allowBrowserCache.sync ? configuration.collectionUri : self.__uncached(
						configuration.collectionUri ) )
					.then( onCollectionReceived, onCollectionRetrievalFailure );
			}

			return self.__loading;
		}

		return self.q.when( self.entityCache );

		/**
		 * Invoked when the collection was received from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onCollectionReceived( serverResponse ) {
			if( !serverResponse.data[ configuration.collectionName ] ) {
				throw new Error( "The response from the server was not in the expected format. It should have a member named '" + configuration.collectionName + "'." );
			}

			self.__entityCacheRaw = serverResponse.data;
			self.entityCache.splice( 0, self.entityCache.length );
			return self.__onDataAvailable( serverResponse.data );
		}

		/**
		 * Invoked when there was an error while trying to retrieve the collection from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onCollectionRetrievalFailure( serverResponse ) {
			self.logInterface.error( self.logPrefix + "Unable to retrieve the collection from the server.",
				serverResponse );
			self.__entityCacheRaw = null;

			self.scope.$emit( "absyncError", serverResponse );

			if( self.throwFailures ) {
				throw serverResponse;
			}
		}

		/**
		 * Invoked when the entity was received from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onSingleEntityReceived( serverResponse ) {
			if( !serverResponse.data[ configuration.entityName ] ) {
				throw new Error( "The response from the server was not in the expected format. It should have a member named '" + configuration.entityName + "'." );
			}

			self.__entityCacheRaw = serverResponse.data;
			self.__onDataAvailable( serverResponse.data );
		}

		/**
		 * Invoked when there was an error while trying to retrieve the entity from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onSingleEntityRetrievalFailure( serverResponse ) {
			self.logInterface.error( self.logPrefix + "Unable to retrieve the entity from the server.",
				serverResponse );
			self.__entityCacheRaw = null;

			self.scope.$emit( "absyncError", serverResponse );

			if( self.throwFailures ) {
				throw serverResponse;
			}
		}
	};

	/**
	 * Pre-seed the cache with the given value.
	 * Usually, you'd want to follow this up with a sync() to get fully in sync with the backend.
	 * @param {Object|Array<Object>} cache
	 * @returns {CacheService}
	 */
	CacheService.prototype.seed = function CacheService$seed( cache ) {
		var self              = this;
		self.__entityCacheRaw = cache;

		return self.__onDataAvailable( self.__entityCacheRaw );
	};

	/**
	 * Insert a phantom into the cache, if no real entity with the same ID exists yet.
	 * Phantoms bypass the raw entity cache.
	 * @param {Object} entity
	 */
	CacheService.prototype.phantom = function CacheService$phantom( entity ) {
		var self = this;

		if( self.has( entity.id ) ) {
			return;
		}

		return self.__onEntityReceived( null, entity );
	};

	/**
	 * Drop existing cache and force reload.
	 * @returns {Promise.<Array.<configuration.model>>|IPromise.<Array>|IPromise.<void>|Q.Promise.<Array.<configuration.model>>|angular.IPromise.<TResult>}
	 */
	CacheService.prototype.sync = function CacheService$sync() {
		var self = this;

		self.__entityCacheRaw = null;

		return self.ensureLoaded( true );
	};

	/**
	 * Check if the given element with the given ID is in the cache.
	 * @param {String} id
	 * @return {Boolean} true if the element is in the cache; false otherwise.
	 */
	CacheService.prototype.has = function CacheService$has( id ) {
		var self = this;

		return self.entityCache.__lookup.hasOwnProperty( id );
	};

	/**
	 * Read a single entity from the cache, or load it from the server if required.
	 * The entity will be placed into the cache.
	 * @param {String} id The ID of the entity to retrieve.
	 * @param {Boolean} [forceReload=false] Should the entity be retrieved from the server, even if it is already in the cache?
	 * @returns {Promise<configuration.model>|IPromise<TResult>|IPromise<void>|angular.IPromise<TResult>}
	 */
	CacheService.prototype.read = function CacheService$read( id, forceReload ) {
		var self = this;

		forceReload = forceReload === true;

		self.logInterface.debug( self.logPrefix + "Requesting entity '" + id + "' (forceReload:" + forceReload + ")…" );

		if( !forceReload ) {
			var entityIndex = 0;

			// Check if the entity is in the cache and return instantly if found.
			if( self.entityCache.__lookup ) {
				entityIndex = self.entityCache.__lookup.hasOwnProperty( id ) ? self.entityCache.__lookup[ id ] : self.entityCache.length;
			}

			for( var entity = self.entityCache[ entityIndex ];
			     entityIndex < self.entityCache.length;
			     ++entityIndex, entity = self.entityCache[ entityIndex ] ) {
				if( entity.id === id ) {
					self.logInterface.debug( self.logPrefix + "Requested entity  '" + id + "' is served from cache." );
					return self.q.when( entity );
				}
			}
		}

		self.logInterface.debug( self.logPrefix + "Requested entity  '" + id + "' is fetched from backend." );

		return self.__requestEntity( id )
			.then( onEntityRetrieved, onEntityRetrievalFailure );

		/**
		 * Invoked when the entity was retrieved from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onEntityRetrieved( serverResponse ) {
			if( !serverResponse.data[ configuration.entityName ] ) {
				throw new Error( "The response from the server was not in the expected format. It should have a member named '" + configuration.entityName + "'." );
			}

			var rawEntity = serverResponse.data[ configuration.entityName ];

			// Put the raw entity into our raw entity cache.
			// We keep the raw copy to allow caching of the raw data.
			self.__cacheMaintain( self.__entityCacheRaw[ configuration.collectionName || configuration.entityName ],
				rawEntity,
				"update",
				false );

			// Deserialize the object and place it into the cache.
			// We do not need to check here if the object already exists in the cache.
			// While it could be possible that the same entity is retrieved multiple times, __updateCacheWithEntity
			// will not insert duplicates into the cache.
			var deserialized = self.deserializer( rawEntity );
			self.__updateCacheWithEntity( deserialized );
			return deserialized;
		}

		/**
		 * Invoked when there was an error while trying to retrieve the entity from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onEntityRetrievalFailure( serverResponse ) {
			self.logInterface.error( self.logPrefix + "Unable to retrieve entity with ID '" + id + "' from the server.",
				serverResponse );
			self.scope.$emit( "absyncError", serverResponse );

			if( self.throwFailures ) {
				throw serverResponse;
			}
		}
	};

	/**
	 * Request an entity from the backend.
	 * @param {String} id The ID of the entity.
	 * @returns {Promise<configuration.model>|IPromise<TResult>|IPromise<void>|angular.IPromise<TResult>}
	 * @private
	 */
	CacheService.prototype.__requestEntity = function CacheService$requestEntity( id ) {
		var self = this;

		if( self.enableRequestCache && self.__requestCache && self.__requestCache[ id ] ) {
			self.logInterface.debug( self.logPrefix + "Entity request    '" + id + "' served from request cache." );
			return self.__requestCache[ id ];
		}

		// Make sure our raw entity cache exists.
		self.__entityCacheRaw                                 = self.__entityCacheRaw || {};
		self.__entityCacheRaw[ configuration.collectionName ] = self.__entityCacheRaw[ configuration.collectionName ] || [];

		var requestUri = configuration.entityUri + ( id ? ( "/" + id ) : "" );

		// Grab the entity from the backend.
		var request = self.httpInterface
			.get( self.allowBrowserCache.request ? requestUri : self.__uncached( requestUri ) )
			.then( removeRequestFromCache.bind( self, id ) );

		if( self.enableRequestCache && self.__requestCache ) {
			self.__requestCache[ id ] = request;
		}

		return request;

		function removeRequestFromCache( id, serverResponse ) {
			delete self.__requestCache[ id ];
			return serverResponse;
		}
	};

	/**
	 * Updates an entity and persists it to the backend and the cache.
	 * @param {configuration.model} entity
	 * @param {Boolean} [returnResult=false] Should the result of the query be returned?
	 * @return {Promise<configuration.model>|IPromise<TResult>|angular.IPromise<TResult>} A promise that will be resolved with the updated entity.
	 */
	CacheService.prototype.update = function CacheService$update( entity, returnResult ) {
		var self = this;

		returnResult = returnResult || false;

		// First create a copy of the object, which has complex properties reduced to their respective IDs.
		var reduced    = self.reduceComplex( entity );
		// Now serialize the object.
		var serialized = self.serializer( reduced );

		// Wrap the entity in a new object, with a single property, named after the entity type.
		var wrappedEntity                         = {};
		wrappedEntity[ configuration.entityName ] = serialized;

		// Check if the entity has an "id" property, if it has, we will update. Otherwise, we create.
		if( "undefined" !== typeof entity.id ) {
			return self.httpInterface
				.put( configuration.entityUri + "/" + entity.id, wrappedEntity )
				.then( afterEntityStored.bind( self, returnResult ), onEntityStorageFailure.bind( self ) );

		} else {
			// Create a new entity
			return self.httpInterface
				.post( configuration.collectionUri, wrappedEntity )
				.then( afterEntityStored.bind( self, returnResult ), onEntityStorageFailure.bind( self ) );
		}
	};

	CacheService.prototype.patch = function CacheService$patch( entity, returnResult ) {
		var self = this;

		returnResult = returnResult || false;

		// First create a copy of the object, which has complex properties reduced to their respective IDs.
		var reduced    = self.reduceComplex( entity );
		// Now serialize the object.
		var serialized = self.serializer( reduced );

		// Wrap the entity in a new object, with a single property, named after the entity type.
		var wrappedEntity                         = {};
		wrappedEntity[ configuration.entityName ] = serialized;

		// Check if the entity has an "id" property, if it has, we will update. Otherwise, we create.
		if( "undefined" !== typeof entity.id ) {
			return self.httpInterface
				.patch( configuration.entityUri + "/" + entity.id, wrappedEntity )
				.then( afterEntityStored.bind( self, returnResult ), onEntityStorageFailure.bind( self ) );

		} else {
			throw new Error( "Attempted to patch an entity that was never stored on the server." );
		}
	};

	/**
	 * Creates a new entity and persists it to the backend and the cache.
	 */
	CacheService.prototype.create = CacheService.prototype.update;

	/**
	 * Invoked when the entity was stored on the server.
	 * @param {Boolean} returnResult Should we return the parsed entity that is contained in the response?
	 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
	 */
	function afterEntityStored( returnResult, serverResponse ) {
		var self = this;

		// Writing an entity to the backend will usually invoke an update event to be
		// broadcast over websockets, where we would also retrieve the updated record.
		// We still put the updated record we receive here into the cache to ensure early consistency, if that is requested.
		if( !returnResult && !self.forceEarlyCacheUpdate ) {
			return;
		}

		if( serverResponse.data[ configuration.entityName ] ) {
			var rawEntity = serverResponse.data[ configuration.entityName ];
			// If early cache updates are forced, put the return entity into the cache.
			if( self.forceEarlyCacheUpdate ) {
				var newEntity = self.deserializer( rawEntity );
				self.__updateCacheWithEntity( newEntity );

				if( returnResult ) {
					return newEntity;
				}
			}
			if( returnResult ) {
				return rawEntity;
			}
		}
	}

	/**
	 * Invoked when there was an error while trying to store the entity on the server.
	 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
	 */
	function onEntityStorageFailure( serverResponse ) {
		var self = this;

		self.logInterface.error( self.logPrefix + "Unable to store entity on the server.",
			serverResponse );
		self.logInterface.error( serverResponse );
		self.scope.$emit( "absyncError", serverResponse );

		if( self.throwFailures ) {
			throw serverResponse;
		}
	}

	/**
	 * Remove an entity from the cache and have it deleted on the backend.
	 * @param {Object} entity
	 */
	CacheService.prototype.delete = function CacheService$delete( entity ) {
		var self = this;

		var entityId = entity.id;
		return self.httpInterface
			.delete( configuration.entityUri + "/" + entityId )
			.then( onEntityDeleted )
			.catch( onEntityDeletionFailed );

		/**
		 * Invoked when the entity was successfully deleted from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onEntityDeleted( serverResponse ) {
			self.__cacheMaintain( self.__entityCacheRaw[ configuration.collectionName || configuration.entityName ],
				entity,
				"delete",
				false );

			return self.__removeEntityFromCache( entityId );
		}

		/**
		 * Invoked when there was an error while trying to delete the entity from the server.
		 * @param {angular.IHttpPromiseCallbackArg|Object} serverResponse The reply sent from the server.
		 */
		function onEntityDeletionFailed( serverResponse ) {
			self.logInterface.error( serverResponse.data );
			self.scope.$emit( "absyncError", serverResponse );

			if( self.throwFailures ) {
				throw serverResponse;
			}
		}
	};

	/**
	 * Put an entity into the cache or update the existing record if the entity was already in the cache.
	 * @param {Object} entityToCache
	 * @private
	 */
	CacheService.prototype.__updateCacheWithEntity = function CacheService$updateCacheWithEntity( entityToCache ) {
		var self = this;

		self.logInterface.info( self.logPrefix + "Updating entity '" + ( entityToCache.id || self.name ) + "' in cache…",
			entityToCache );

		return self.__cacheMaintain( self.entityCache, entityToCache, "update", true );
	};

	/**
	 * Perform maintenance operations on a cache.
	 * @param cache The cache to operate on.
	 * @param entityToCache The entity that the operation is relating to.
	 * @param {String} operation The operation to perform.
	 * @param {Boolean} [emit=false] Should appropriate absync events be broadcast to notify other actors?
	 * @private
	 */
	CacheService.prototype.__cacheMaintain = function CacheService$cacheMaintain( cache, entityToCache, operation, emit ) {
		var self = this;

		var entityIndex = 0;
		var entity      = cache[ entityIndex ];

		if( self.filter ) {
			if( !self.filter( entityToCache ) ) {
				self.logInterface.info( self.logPrefix + "Entity '" + ( entityToCache.id || self.name ) + "' was filtered.",
					entityToCache );
				return;
			}
		}

		if( cache.__lookup ) {
			entityIndex = cache.__lookup.hasOwnProperty( entityToCache.id ) ? cache.__lookup[ entityToCache.id ] : cache.length;
			entity      = cache[ entityIndex ];
		}

		switch( operation ) {
			case "update":
				if( !Array.isArray( cache ) ) {
					if( emit ) {
						// Allow the user to intervene in the update process, before updating the entity.
						self.scope.$broadcast( "beforeEntityUpdated",
							{
								service : self,
								cache   : cache,
								entity  : cache,
								updated : entityToCache
							} );
					}

					if( typeof cache.copyFrom === "function" ) {
						cache.copyFrom( entityToCache );

					} else {
						angular.extend( cache, entityToCache );
					}

					// After updating the entity, send another event to allow the user to react.
					self.scope.$broadcast( "entityUpdated",
						{
							service : self,
							cache   : cache,
							entity  : cache
						} );
					return;
				}

				var found = false;
				for( angular.noop; entityIndex < cache.length; ++entityIndex, entity = cache[ entityIndex ] ) {
					if( entity.id === entityToCache.id ) {
						if( emit ) {
							// Allow the user to intervene in the update process, before updating the entity.
							self.scope.$broadcast( "beforeEntityUpdated",
								{
									service : self,
									cache   : cache,
									entity  : cache[ entityIndex ],
									updated : entityToCache
								} );
						}

						// Use the "copyFrom" method on the entity, if it exists, otherwise use naive approach.
						var targetEntity = cache[ entityIndex ];
						if( typeof targetEntity.copyFrom === "function" ) {
							targetEntity.copyFrom( entityToCache );

						} else {
							angular.extend( targetEntity, entityToCache );
						}

						found = true;

						if( emit ) {
							// After updating the entity, send another event to allow the user to react.
							self.scope.$broadcast( "entityUpdated",
								{
									service : self,
									cache   : cache,
									entity  : cache[ entityIndex ]
								} );
						}
						break;
					}
				}

				// If the entity wasn't found in our records, it's a new entity.
				if( !found ) {
					if( emit ) {
						self.scope.$broadcast( "beforeEntityNew", {
							service : self,
							cache   : cache,
							entity  : entityToCache
						} );
					}

					cache.push( entityToCache );
					if( cache.__lookup ) {
						cache.__lookup[ entityToCache.id ] = cache.length - 1;
					}

					if( emit ) {
						self.scope.$broadcast( "entityNew", {
							service : self,
							cache   : cache,
							entity  : entityToCache
						} );
					}
				}
				break;

			case "delete":
				// The "delete" operation is not expected to happen for single cached entities.
				for( angular.noop; entityIndex < cache.length; ++entityIndex, entity = cache[ entityIndex ] ) {
					if( entity.id === entityToCache.id ) {
						if( emit ) {
							// Before removing the entity, allow the user to react.
							self.scope.$broadcast( "beforeEntityRemoved", {
								service : self,
								cache   : cache,
								entity  : entity
							} );
						}

						// Remove the entity from the cache.
						cache.splice( entityIndex, 1 );

						if( cache.__lookup ) {
							delete cache.__lookup[ entityToCache.id ];

							for( var cacheEntry in cache.__lookup ) {
								if( entityIndex <= cache.__lookup[ cacheEntry ] ) {
									--cache.__lookup[ cacheEntry ];
								}
							}
						}

						if( emit ) {
							// Send another event to allow the user to take note of the removal.
							self.scope.$broadcast( "entityRemoved", {
								service : self,
								cache   : cache,
								entity  : entity
							} );
						}
						break;
					}
				}
				break;
		}
	};

	/**
	 * Removes an entity from the internal cache. The entity is not removed from the backend.
	 * @param {String} id The ID of the entity to remove from the cache.
	 * @private
	 */
	CacheService.prototype.__removeEntityFromCache = function CacheService$removeEntityFromCache( id ) {
		var self = this;

		return self.__cacheMaintain( self.entityCache, {
			id : id
		}, "delete", true );
	};

	/**
	 * Retrieve an associative array of all cached entities, which uses the ID of the entity records as the key in the array.
	 * This is a convenience method that is not utilized internally.
	 * @returns {Array<configuration.model>}
	 */
	CacheService.prototype.lookupTableById = function CacheService$lookupTableById() {
		var self = this;

		var lookupTable = [];
		for( var entityIndex = 0;
		     entityIndex < self.entityCache.length;
		     ++entityIndex ) {
			lookupTable[ self.entityCache[ entityIndex ].id ] = self.entityCache[ entityIndex ];
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
	CacheService.prototype.reduceComplex = function CacheService$reduceComplex( entity, arrayInsteadOfObject ) {
		var self = this;

		var result = arrayInsteadOfObject ? [] : {};
		for( var propertyName in entity ) {
			if( !entity.hasOwnProperty( propertyName ) ) {
				continue;
			}

			// Recurse for nested arrays.
			if( Array.isArray( entity[ propertyName ] ) ) {
				result[ propertyName ] = self.reduceComplex( entity[ propertyName ], true );
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
	 * @param {CacheService} cache An instance of another caching service that can provide the complex
	 * type instances which are being referenced in entity.
	 * @param {Object|Boolean} [options] A hash with options relating to the population process.
	 * @param {Boolean} [options.force=false] If true, all complex types will be replaced with references to the
	 * instances in cache; otherwise, only properties that are string representations of complex type IDs will be replaced.
	 * @param {Boolean} [options.crossLink=false] If true, the entity will also be put into a relating property in the
	 * foreign entity.
	 * @param {String} [options.crossLinkProperty] The name of the property in the foreign type into which the entity
	 * should be cross-linked.
	 * @returns {IPromise<TResult>|IPromise<any[]>|IPromise<{}>|angular.IPromise<TResult>}
	 */
	CacheService.prototype.populateComplex = function CacheService$populateComplex( entity, propertyName, cache, options ) {
		var self = this;

		options = options || {};
		if( typeof options === "boolean" ) {
			self.logInterface.warn( "Argument 'force' is deprecated. Provide an options hash instead." );
			options = {
				force : options
			};
		}
		options.force             = options.force || false;
		options.crossLink         = options.crossLink || false;
		options.crossLinkProperty = options.crossLinkProperty || "";

		if( options.crossLink && !options.crossLinkProperty ) {
			self.logInterface.warn(
				"Option 'crossLink' given without 'crossLinkProperty'. Cross-linking will be disabled." );
			options.crossLink = false;
		}

		// If the target property is an array, ...
		if( Array.isArray( entity[ propertyName ] ) ) {
			// ...map the elements in the array to promises.
			var promises = entity[ propertyName ].map( mapElementToPromise );

			return self.q.all( promises );

		} else {
			// We usually assume the properties to be strings (the ID of the referenced complex).
			if( typeof entity[ propertyName ] !== "string" ) {
				// If "force" is enabled, we check if this non-string property is an object and has an "id" member, which is a string.
				if( options.force && typeof entity[ propertyName ] === "object" && typeof entity[ propertyName ].id === "string" ) {
					// If that is true, then we replace the whole object with the ID and continue as usual.
					entity[ propertyName ] = entity[ propertyName ].id;

				} else {
					if( self.throwFailures ) {
						throw new Error( "The referenced entity did not have an 'id' property that would be expected." );
					}
					return self.q.when( false );
				}
			}

			// Treat the property as an ID and read the complex with that ID from the cache.
			return cache.read( entity[ propertyName ] )
				.then( onComplexRetrieved );
		}

		function mapElementToPromise( element, index ) {
			// We usually assume the properties to be strings (the ID of the referenced complex).
			if( typeof entity[ propertyName ][ index ] !== "string" ) {
				// If "force" is enabled, we check if this non-string property is an object and has an "id" member, which is a string.
				if( options.force && typeof entity[ propertyName ][ index ] === "object" && typeof entity[ propertyName ][ index ].id === "string" ) {
					// If that is true, then we replace the whole object with the ID and continue as usual.
					entity[ propertyName ][ index ] = entity[ propertyName ][ index ].id;

				} else {
					if( self.throwFailures ) {
						throw new Error( "The referenced entity did not have an 'id' property that would be expected." );
					}

					return self.q.when( false );
				}
			}

			// Treat the property as an ID and read the complex with that ID from the cache.
			return cache.read( entity[ propertyName ][ index ] )
				.then( onComplexRetrieved );

			function onComplexRetrieved( complex ) {
				// When the complex was retrieved, store it back into the array.
				entity[ propertyName ][ index ] = complex;

				if( options.crossLink ) {
					crossLink( complex, entity );
				}

				return entity;
			}
		}

		function onComplexRetrieved( complex ) {
			// When the complex was retrieved, store it back into the entity.
			entity[ propertyName ] = complex;

			if( options.crossLink ) {
				crossLink( complex, entity );
			}

			return entity;
		}

		function crossLink( complex, entity ) {
			// If cross-linking is enabled, put our entity into the foreign complex.
			if( Array.isArray( complex[ options.crossLinkProperty ] ) ) {
				// Check if the ID exists in the array.
				var idIndex = complex[ options.crossLinkProperty ].indexOf( entity.id );
				if( -1 < idIndex ) {
					// Replace the ID with the entity.
					complex[ options.crossLinkProperty ][ idIndex ] = entity;
					return;
				}

				// Check if the entity is already linked into the array.
				for( var lookupIndex = 0, lookupEntity = complex[ options.crossLinkProperty ][ 0 ];
				     lookupIndex < complex[ options.crossLinkProperty ].length;
				     ++lookupIndex, lookupEntity = complex[ options.crossLinkProperty ][ lookupIndex ] ) {
					// Check if the exact same reference is already within the array.
					if( lookupEntity === entity ) {
						return;
					}

					// Check if another element with the same ID already exists in the array.
					if( lookupEntity.id === entity.id ) {
						complex[ options.crossLinkProperty ][ lookupIndex ] = entity;
						return;
					}
				}

				// Just push the element into the array.
				complex[ options.crossLinkProperty ].push( entity );
				return;
			}

			complex[ options.crossLinkProperty ] = entity;
		}
	};

	/**
	 * Reset the state of the cache service to when it was first instantiated.
	 * Assumes that the configuration was not touched.
	 * This method is primarily targeted at testing, but can be useful in production as well.
	 */
	CacheService.prototype.reset = function CacheService$reset() {
		var self = this;

		self.entityCache          = self.configuration.collectionName ? [] : {};
		self.entityCache.__lookup = self.entityCache.__lookup || {};

		self.__entityCacheRaw = null;
		self.__requestCache   = {};
	};

	return CacheService;
}

function serializationNoop( model ) {
	return model;
}
