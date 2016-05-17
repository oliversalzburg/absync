/* globals angular, io */

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
	.provider( "absync", getAbsyncProvider );

/**
 * Retrieves the absync provider.
 * @param {angular.auto.IInjectorService|Object} $injector The $injector provider.
 * @param {angular.auto.IProvideService|Object} $provide The $provide provider
 * @param {Function} absyncCache The AbsyncCache service constructor.
 * @ngInject
 */
function getAbsyncProvider( $injector, $provide, absyncCache ) {
	return new AbsyncProvider( $injector, $provide, absyncCache );
}

/**
 * Retrieves the absync provider.
 * @param {angular.auto.IInjectorService|Object} $injector The $injector provider.
 * @param {angular.auto.IProvideService|Object} $provide The $provide provider.
 * @param {Function} absyncCache The AbsyncCache service constructor.
 * @constructor
 */
function AbsyncProvider( $injector, $provide, absyncCache ) {
	var self = this;

	// Store a reference to the inject provider.
	self.__injector    = $injector;
	// Store a reference to the provide provider.
	self.__provide     = $provide;
	// Store a reference to the cache service constructor.
	self.__absyncCache = absyncCache;

	// A reference to the socket.io instance we're using to receive updates from the server.
	self.__ioSocket = null;
	// We usually register event listeners on the socket.io instance right away.
	// If socket.io was not connected when a service was constructed, we put the registration request
	// into this array and register it as soon as socket.io is configured.
	self.__registerLater = [];
	// References to all registered event listeners.
	self.__listeners     = [];

	// The collections that absync provides.
	// The keys are the names of the collections, the value contains the constructor of
	// the respective cache service.
	self.__collections = {};

	// The entities that absync provides.
	// The keys are the names of the entities, the value contains the constructor of
	// the respective cache service.
	self.__entities = {};

	// Debug should either be set through a configure() call, or on instantiated services.
	self.debug = undefined;
}

/**
 * Register the configurator on the provider itself to allow early configuration during setup phase.
 * It is recommended to configure absync within a configuration phase of a module.
 * @param {Object} configuration The configuration for the absync provider.
 * Can have a member `socket`, pointing to the socket.io instance or constructor to use.
 * Can have a member `debug`, enabling debugging, if set to true.
 */
AbsyncProvider.prototype.configure = function AbsyncProvider$configure( configuration ) {
	var self = this;

	if( typeof configuration.socket !== "undefined" ) {
		var socket   = configuration.socket;
		// Determine if the socket is an io.Socket.
		var isSocket = typeof io !== "undefined" && io.Socket && socket instanceof io.Socket;

		if( typeof socket == "function" ) {
			// Expect the passed socket to be a constructor.
			self.__ioSocket = new socket();// jscs:ignore requireCapitalizedConstructors

		} else if( isSocket ) {
			// Expect the passed socket to be an io.Socket instance.
			self.__ioSocket = socket;

		} else {
			throw new Error( "configure() expects input to be a function or a socket.io Socket instance." );
		}

		// Check if services already tried to register listeners, if so, register them now.
		// This can happen when a service was constructed before absync was configured.
		if( self.__registerLater.length ) {
			angular.forEach( self.__registerLater, self.__registerListener.bind( self ) );
			self.__registerLater = [];
		}
	}

	if( typeof configuration.debug !== "undefined" ) {
		self.debug = configuration.debug || false;
	}

	if( self.debug ) {
		angular.forEach( self.__collections, function enableDebugging( collection ) {
			collection.configuration.debug = true;
		} );
		angular.forEach( self.__entities, function enableDebugging( entity ) {
			entity.configuration.debug = true;
		} );
	}
};

/**
 * Detaches absync from the websocket.
 * @param {Boolean} [disconnectSocket=false] Should the underlying socket.io connection be disconnected as well?
 */
AbsyncProvider.prototype.disconnect = function AbsyncProvider$disconnect( disconnectSocket ) {
	var self = this;

	disconnectSocket = disconnectSocket || false;

	angular.forEach( self.__listeners, function unregisterListener( listener ) {
		listener.unregister();
		delete listener.unregister;
		self.__registerLater.push( listener );
	} );

	if( disconnectSocket ) {
		self.__ioSocket.disconnect();
		self.__ioSocket = null;
	}
};

/**
 * Register an event listener with socket.io.
 * @param {Object} listener
 * @private
 */
AbsyncProvider.prototype.__registerListener = function AbsyncProvider$registerListener( listener ) {
	var self = this;

	// Remember this listener.
	self.__listeners.push( listener );

	// Register the listener and remember the function to use when the listener should be unregistered.
	listener.unregister = self.__handleEntityEvent( listener.eventName, listener.callback );
};

/**
 * Request a new synchronized collection.
 * This only registers the intent to use that collection. It will be constructed when it is first used.
 * @param {String} name The name of the collection and service name.
 * @param {AbsyncServiceConfiguration|Object} configuration The configuration for this collection.
 */
AbsyncProvider.prototype.collection = function AbsyncProvider$collection( name, configuration ) {
	var self = this;

	// Collection/entity names (and, thus service names) have to be unique.
	// We can't create multiple services with the same name.
	if( self.__collections[ name ] ) {
		throw new Error( "A collection with the name '" + name + "' was already requested. Names for collections must be unique." );
	}
	if( self.__entities[ name ] ) {
		throw new Error( "An entity with the name '" + name + "' was already requested. Names for collections must be unique and can't be shared with entities." );
	}

	// If no debug flag was set, use the value from the core absync provider.
	configuration.debug = typeof configuration.debug === "undefined" ? self.debug : configuration.debug;

	// Register the service configuration.
	// __absyncCache will return a constructor for a service with the given configuration.
	self.__collections[ name ] = {
		constructor   : self.__absyncCache( name, configuration ),
		configuration : configuration
	};

	// Register the new service.
	// Yes, we want an Angular "service" here, because we want it constructed with "new".
	self.__provide.service( name, self.__collections[ name ].constructor );
};

/**
 * Request a new synchronized entity.
 * This only registers the intent to use that entity. It will be constructed when it is first used.
 * @param {String} name The name of the entity and service name.
 * @param {AbsyncServiceConfiguration|Object} configuration The configuration for this entity.
 */
AbsyncProvider.prototype.entity = function AbsyncProvider$entity( name, configuration ) {
	var self = this;

	// Collection/entity names (and, thus service names) have to be unique.
	// We can't create multiple services with the same name.
	if( self.__entities[ name ] ) {
		throw new Error( "An entity with the name '" + name + "' was already requested. Names for entities must be unique." );
	}
	if( self.__collections[ name ] ) {
		throw new Error( "A collection with the name '" + name + "' was already requested. Names for entities must be unique and can't be shared with collections." );
	}

	// If no debug flag was set, use the value from the core absync provider.
	configuration.debug = typeof configuration.debug === "undefined" ? self.debug : configuration.debug;

	// Register the service configuration.
	// __absyncCache will return a constructor for a service with the given configuration.
	self.__entities[ name ] = {
		constructor   : self.__absyncCache( name, configuration ),
		configuration : configuration
	};

	// Register the new service.
	// Yes, we want an Angular "service" here, because we want it constructed with "new".
	self.__provide.service( name, self.__entities[ name ].constructor );
};


/**
 * Register an event listener that is called when a specific entity is received on the websocket.
 * @param {String} eventName The event name, usually the name of the entity.
 * @param {Function} callback The function to call when the entity is received.
 * @return {Function|null} If the listener could be registered, it returns a function that, when called, removes
 * the event listener.
 * If the listener registration was delayed, null is returned.
 */
AbsyncProvider.prototype.on = function AbsyncProvider$on( eventName, callback ) {
	var self = this;

	// If we have no configured socket.io connection yet, remember to register it later.
	if( !self.__ioSocket ) {

		if( self.__registerLater.length > 8192 ) {
			// Be defensive, something is probably not right here.
			return null;
		}

		// TODO: Use promises here, so that we can always return the event listener removal function.
		self.__registerLater.push( {
			eventName : eventName,
			callback  : callback
		} );
		return null;
	}

	return self.__registerListener( {
		eventName : eventName,
		callback  : callback
	} );
};

/**
 * Register an event listener on the websocket.
 * @param {String} eventName The event name, usually the name of the entity.
 * @param {Function} callback The function to call when the entity is received.
 * @returns {Function}
 */
AbsyncProvider.prototype.__handleEntityEvent = function AbsyncProvider$handleEntityEvent( eventName, callback ) {
	var self = this;

	// Register the callback with socket.io.
	self.__ioSocket.on( eventName, callback );

	// Return a function that removes the listener.
	return function removeListener() {
		self.__ioSocket.removeListener( eventName, callback );
	};
};

/**
 * Convenience method to allow the user to emit() from the socket.io connection.
 * This is not utilized in absync internally.
 * @param {String} eventName
 * @param {*} data
 * @param {Function} [callback]
 */
AbsyncProvider.prototype.emit = function AbsyncProvider$emit( eventName, data, callback ) {
	var self = this;

	if( !self.__ioSocket ) {
		throw new Error( "socket.io is not initialized." );
	}

	self.__ioSocket.emit( eventName, data, function afterEmit() {
		if( callback ) {
			callback.apply( self.__ioSocket, arguments );
		}
	} );
};

/**
 * The service is just used as a convenience to access the provider.
 * @returns {AbsyncProvider}
 * @ngInject
 */
AbsyncProvider.prototype.$get = function AbsyncProvider$$get() {
	return this;
};
