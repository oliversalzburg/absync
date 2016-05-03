// jscs:disable requireNamedUnassignedFunctions
"use strict";

describe( "absync", function() {
	var $httpBackend;
	var $rootScope;
	var devices;

	beforeEach( function() {
		angular
			.module( "test", [] )
			.config( function( _absyncProvider_ ) {
				var serviceDefinition = {
					model          : "Device",
					collectionName : "devices",
					collectionUri  : "/api/devices",
					entityName     : "device",
					entityUri      : "/api/device",
					debug          : true
				};

				_absyncProvider_.configure( SockMock );
				_absyncProvider_.collection( "devices", serviceDefinition );
			} )
			.constant( "Device", {} );

		module( "absync", "test" );
	} );

	beforeEach( inject( function( _$httpBackend_, _$rootScope_ ) {
		$httpBackend = _$httpBackend_;
		$rootScope   = _$rootScope_;

		$httpBackend
			.when( "GET", "/api/devices" )
			.respond( {
				devices : [ {
					id   : 1,
					name : "My Device"
				} ]
			} );

		$httpBackend
			.when( "GET", "/api/device/1" )
			.respond( {
				device : {
					id   : 1,
					name : "My Device"
				}
			} );
	} ) );

	beforeEach( inject( function( _devices_ ) {
		devices = _devices_;
		devices.reset();
	} ) );

	it( "should construct a caching service", function() {
		expect( devices ).to.be.an( "object" );
	} );

	it( "should load a collection", function() {
		devices.ensureLoaded();
		$httpBackend.flush();
		expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );
	} );

	it( "should cached the loaded collection", function() {
		devices.ensureLoaded();
		$httpBackend.flush();
		expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

		var entity = devices.entityCache[ 0 ];

		devices.ensureLoaded();
		expect( devices.entityCache[ 0 ] ).to.equal( entity );
	} );

	it( "should forget cached collections when reset", function() {
		devices.ensureLoaded();
		$httpBackend.flush();
		expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

		var entity = devices.entityCache[ 0 ];
		devices.reset();

		devices.ensureLoaded();
		expect( devices.entityCache[ 0 ] ).to.not.equal( entity );
	} );

	it( "should provide an entity", function( done ) {
		devices.ensureLoaded();
		$httpBackend.flush();
		devices.read( 1 )
			.then( function( device ) {
				expect( device ).to.be.an( "object" ).with.property( "name" ).that.equals( "My Device" );
			} )
			.then( done )
			.catch( done );
		$rootScope.$digest();
	} );

	it( "should provide an entity when collection is not loaded", function( done ) {
		devices.read( 1 )
			.then( function( device ) {
				expect( device ).to.be.an( "object" ).with.property( "name" ).that.equals( "My Device" );
			} )
			.then( done )
			.catch( done );
		$httpBackend.flush();
	} );
} );

/**
 * Simple mock for socket.io
 * @see https://github.com/hackify/hackify-server/blob/90332597a81c0e46ae2cb8b6e4e3f7a428dfde4f/test/controllers.test.js#L310
 */
function SockMock() {
	this.events = {};
	this.emits  = {};

	// Intercept 'on' calls and capture the callbacks
	this.on = function( eventName, callback ) {
		if( !this.events[ eventName ] ) {
			this.events[ eventName ] = [];
		}
		this.events[ eventName ].push( callback );
	};

	// Intercept 'emit' calls from the client and record them to assert against in the test
	this.emit = function( eventName ) {
		var args = Array.prototype.slice.call( arguments, 1 );

		if( !this.emits[ eventName ] ) {
			this.emits[ eventName ] = [];
		}
		this.emits[ eventName ].push( args );
	};

	// Simulate an inbound message to the socket from the server (only called from the test)
	this.receive = function( eventName ) {
		var args = Array.prototype.slice.call( arguments, 1 );

		if( this.events[ eventName ] ) {
			angular.forEach( this.events[ eventName ], function( callback ) {
				callback.apply( this, args );
			} );
		}
	};
}
