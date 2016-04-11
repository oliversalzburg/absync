(function() {
"use strict";
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
 * @param {angular.auto.IProvideService|Object} $provide The $provide provider
 * @param {Function} absyncCache The AbsyncCache service constructor.
 * @ngInject
 */
function getAbsyncProvider( $provide, absyncCache ) {
	return new AbsyncProvider( $provide, absyncCache );
}
getAbsyncProvider.$inject = ["$provide", "absyncCache"];

/**
 * Retrieves the absync provider.
 * @param {angular.auto.IProvideService|Object} $provide The $provide provider
 * @param {Function} absyncCache The AbsyncCache service constructor.
 * @constructor
 */
function AbsyncProvider( $provide, absyncCache ) {
	var self = this;

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

	// The collections that absync provides.
	// The keys are the names of the collections, the value contains the constructor of
	// the respective cache service.
	self.__collections = {};

	// The entities that absync provides.
	// The keys are the names of the entities, the value contains the constructor of
	// the respective cache service.
	self.__entities = {};
}

/**
 * Register the configurator on the provider itself to allow early configuration during setup phase.
 * It is recommended to configure absync within a configuration phase of a module.
 * @param {io.Socket|Function|Object} configuration The socket.io instance to use.
 * Can also be a constructor for a socket.
 * Can also be an object with a "socket" member that provides either of the above.
 * @param {Boolean} [debug=false] Enable additional debugging output.
 */
AbsyncProvider.prototype.configure = function AbsyncProvider$configure( configuration, debug ) {
	var self = this;

	// If the configuration has a "socket" member, unpack it.
	var socket   = configuration.socket || configuration;
	// Determine if the socket is an io.Socket.
	var isSocket = io && io.Socket && socket instanceof io.Socket;

	if( typeof socket == "function" ) {
		// Expect the passed socket to be a constructor.
		self.__ioSocket = socket();

	} else if( isSocket ) {
		// Expect the passed socket to be an io.Socket instance.
		self.__ioSocket = socket;

	} else {
		throw new Error( "configure() expects input to be a function or a socket.io Socket instance." );
	}

	// Check if services already tried to register listeners, if so, register them now.
	// This can happen when a service was constructed before absync was configured.
	if( self.__registerLater.length ) {
		self.__registerLater.forEach( self.__registerListener.bind( self ) );
		self.__registerLater = [];
	}

	self.debug = debug || false;
};

AbsyncProvider.prototype.__registerListener = function AbsyncProvider$registerListener( listener ) {
	var self = this;
	self.$get().__handleEntityEvent( listener.eventName, listener.callback );
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
	self.__collections[ name ] = self.__absyncCache( name, configuration );

	// Register the new service.
	// Yes, we want an Angular "service" here, because we want it constructed with "new".
	self.__provide.service( name, self.__collections[ name ] );
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
	self.__entities[ name ] = self.__absyncCache( name, configuration );

	// Register the new service.
	// Yes, we want an Angular "service" here, because we want it constructed with "new".
	self.__provide.service( name, self.__entities[ name ] );
};

/**
 * Register the service factory.
 * @returns {AbsyncService}
 * @ngInject
 */
AbsyncProvider.prototype.$get = function AbsyncProvider$$get() {
	return new AbsyncService( this );
};

/**
 * The service that is received when injecting "absync".
 * This service is primarily used internally to set up the connection between socket.io and the individual
 * caching services.
 * @param {AbsyncProvider|Object} parentProvider The AbsyncProvider that provides this service.
 * @constructor
 */
function AbsyncService( parentProvider ) {
	this.__absyncProvider = parentProvider;
}

/**
 * Configure the socket.io connection for absync.
 * This configuration of absync should usually be performed through the absyncProvider in the configuration
 * phase of a module.
 * @param {io.Socket|Function|Object} configuration The socket.io instance to use.
 * @param {Boolean} [debug=false] Enable additional debug output.
 */
AbsyncService.prototype.configure = function AbsyncService$configure( configuration, debug ) {
	var _absyncProvider = this.__absyncProvider;
	_absyncProvider.configure( configuration, debug || false );
};

/**
 * Register an event listener that is called when a specific entity is received on the websocket.
 * @param {String} eventName The event name, usually the name of the entity.
 * @param {Function} callback The function to call when the entity is received.
 * @return {Function|null} If the listener could be registered, it returns a function that, when called, removes
 * the event listener.
 * If the listener registration was delayed, null is returned.
 */
AbsyncService.prototype.on = function AbsyncService$on( eventName, callback ) {
	var _absyncProvider = this.__absyncProvider;
	var self            = this;

	// If we have no configured socket.io connection yet, remember to register it later.
	if( !_absyncProvider.__ioSocket ) {

		if( _absyncProvider.__registerLater.length > 8192 ) {
			// Be defensive, something is probably not right here.
			return null;
		}

		// TODO: Use promises here, so that we can always return the event listener removal function.
		_absyncProvider.__registerLater.push( {
			eventName : eventName,
			callback  : callback
		} );
		return null;
	}

	return self.__handleEntityEvent( eventName, callback );
};

/**
 * Register an event listener on the websocket.
 * @param {String} eventName The event name, usually the name of the entity.
 * @param {Function} callback The function to call when the entity is received.
 * @returns {Function}
 */
AbsyncService.prototype.__handleEntityEvent = function AbsyncService$handleEntityEvent( eventName, callback ) {
	var _absyncProvider = this.__absyncProvider;

	// Register the callback with socket.io.
	_absyncProvider.__ioSocket.on( eventName, callback );

	// Return a function that removes the listener.
	return function removeListener() {
		_absyncProvider.__ioSocket.removeListener( eventName, callback );
	};
};

/**
 * Convenience method to allow the user to emit() from the websocket.
 * This is not utilized in absync internally.
 * @param {String} eventName
 * @param {*} data
 * @param {Function} [callback]
 */
AbsyncService.prototype.emit = function AbsyncService$emit( eventName, data, callback ) {
	var _absyncProvider = this.__absyncProvider;

	if( !_absyncProvider.__ioSocket ) {
		throw new Error( "socket.io is not initialized." );
	}

	_absyncProvider.__ioSocket.emit( eventName, data, function afterEmit() {
		if( callback ) {
			callback.apply( _absyncProvider.__ioSocket, arguments );
		}
	} );
};
}());