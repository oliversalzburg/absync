(function( undefined ) {
	"use strict";

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
		var _absyncProvider = this;

		// Store a reference to the provide provider.
		_absyncProvider.__provide = $provide;
		// Store a reference to the cache service constructor.
		_absyncProvider.__absyncCache = absyncCache;

		// A reference to the socket.io instance we're using to receive updates from the server.
		_absyncProvider.__ioSocket = null;
		// We usually register event listeners on the socket.io instance right away.
		// If socket.io was not connected when a service was constructed, we put the registration request
		// into this array and register it as soon as socket.io is configured.
		_absyncProvider.__registerLater = [];

		// The collections that absync provides.
		// The keys are the names of the collections, the value contains the constructor of
		// the respective cache service.
		_absyncProvider.__collections = {};
	}

	/**
	 * Register the configurator on the provider itself to allow early configuration during setup phase.
	 * It is recommended to configure absync within a configuration phase of a module.
	 * @param {io.Socket|Function|Object} configuration The socket.io instance to use.
	 * Can also be a constructor for a socket.
	 * Can also be an object with a "socket" member that provides either of the above.
	 */
	AbsyncProvider.prototype.configure = function AbsyncProvider$configure( configuration ) {
		var _absyncProvider = this;

		// If the configuration has a "socket" member, unpack it.
		//noinspection JSUnresolvedVariable
		var socket = configuration.socket || configuration;
		// Determine if the socket is an io.Socket.
		//noinspection JSUnresolvedVariable
		var isSocket = io && io.Socket && socket instanceof io.Socket;

		if( typeof socket == "function" ) {
			// Expect the passed socket to be a constructor.
			_absyncProvider.__ioSocket = socket();

		} else if( isSocket ) {
			// Expect the passed socket to be an io.Socket instance.
			_absyncProvider.__ioSocket = socket;

		} else {
			throw new Error( "configure() expects input to be a function or a socket.io Socket instance." );
		}

		// Check if services already tried to register listeners, if so, register them now.
		// This can happen when a service was constructed before absync was configured.
		if( _absyncProvider.__registerLater.length ) {
			_absyncProvider.__registerLater.forEach( _absyncProvider.__registerListener.bind( _absyncProvider ) );
			_absyncProvider.__registerLater = [];
		}
	};

	AbsyncProvider.prototype.__registerListener = function AbsyncProvider$__registerListener( listener ) {
		var _absyncProvider = this;
		_absyncProvider.$get().__handleEntityEvent( listener.eventName, listener.callback );
	};

	//TODO: Remove this noinspection when WebStorm 11 is available.
	//noinspection JSValidateJSDoc
	/**
	 * Request a new synchronized collection.
	 * This only registers the intent to use that collection. It will be constructed when it is first used.
	 * @param {String} name The name of the collection and service name.
	 * @param {AbsyncServiceConfiguration|Object} configuration The configuration for this collection.
	 */
	AbsyncProvider.prototype.collection = function AbsyncProvider$collection( name, configuration ) {
		var _absyncProvider = this;

		// Collection names (and, thus service names) have to be unique.
		// We can't create multiple services with the same name.
		if( _absyncProvider.__collections[ name ] ) {
			throw new Error( "A collection with the name '" + name + "' was already requested. Names for collections must be unique." );
		}

		// Register the service configuration.
		// __absyncCache will return a constructor for a service with the given configuration.
		_absyncProvider.__collections[ name ] = _absyncProvider.__absyncCache( name, configuration );

		// Register the new service.
		// Yes, we want an Angular "service" here, because we want it constructed with "new".
		_absyncProvider.__provide.service( name, _absyncProvider.__collections[ name ] );
	};

	//noinspection JSUnusedGlobalSymbols
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
	 */
	AbsyncService.prototype.configure = function AbsyncService$configure( configuration ) {
		var _absyncProvider = this.__absyncProvider;
		_absyncProvider.configure( configuration );
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
		var _absyncService = this;

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

		return _absyncService.__handleEntityEvent( eventName, callback );
	};

	/**
	 * Register an event listener on the websocket.
	 * @param {String} eventName The event name, usually the name of the entity.
	 * @param {Function} callback The function to call when the entity is received.
	 * @returns {Function}
	 */
	AbsyncService.prototype.__handleEntityEvent = function AbsyncService$__handleEntityEvent( eventName, callback ) {
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
