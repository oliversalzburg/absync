// jscs:disable requireNamedUnassignedFunctions
"use strict";

describe( "absync", function() {
	var $httpBackend;
	var $rootScope;

	var devices;
	var users;

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
			.config( function( _absyncProvider_ ) {
				var serviceDefinition = {
					model          : "User",
					collectionName : "users",
					collectionUri  : "/api/users",
					entityName     : "user",
					entityUri      : "/api/user",
					debug          : true
				};

				_absyncProvider_.configure( SockMock );
				_absyncProvider_.collection( "users", serviceDefinition );
			} )
			.constant( "Device", {
				deserialize : function( data ) {
					return angular.copy( data );
				}
			} )
			.constant( "User", {
				deserialize : function( data ) {
					return angular.copy( data );
				}
			} );

		module( "absync", "test" );
	} );

	// Set up the devices API
	beforeEach( inject( function( _$httpBackend_, _$rootScope_ ) {
		$httpBackend = _$httpBackend_;
		$rootScope   = _$rootScope_;

		$httpBackend
			.when( "GET", "/api/devices" )
			.respond( {
				devices : [ {
					id    : "1",
					name  : "My Device",
					owner : "1"
				} ]
			} );

		$httpBackend
			.when( "GET", "/api/device/1" )
			.respond( {
				device : {
					id    : "1",
					name  : "My Device",
					owner : "1"
				}
			} );

		// This device is not served with the collection GET.
		$httpBackend
			.when( "GET", "/api/device/2" )
			.respond( {
				device : {
					id    : "2",
					name  : "Another Device",
					owner : "2"
				}
			} );

		$httpBackend
			.when( "DELETE", "/api/device/1" )
			.respond( 200 );
	} ) );

	// Set up the users API
	beforeEach( inject( function( _$httpBackend_, _$rootScope_ ) {
		$httpBackend = _$httpBackend_;
		$rootScope   = _$rootScope_;

		$httpBackend
			.when( "GET", "/api/users" )
			.respond( {
				users : [ {
					id   : "1",
					name : "John Doe"
				} ]
			} );

		$httpBackend
			.when( "GET", "/api/user/1" )
			.respond( {
				user : {
					id   : "1",
					name : "John Doe"
				}
			} );

		// This user is not served with the collection GET.
		$httpBackend
			.when( "GET", "/api/user/2" )
			.respond( {
				user : {
					id   : "2",
					name : "Jane Smith"
				}
			} );
	} ) );

	beforeEach( inject( function( _devices_, _users_ ) {
		devices = _devices_;
		devices.reset();

		users = _users_;
		users.reset();
	} ) );

	it( "should construct a caching service", function() {
		expect( devices ).to.be.an( "object" );
	} );

	it( "should load a collection", function() {
		devices.ensureLoaded();
		$httpBackend.flush();
		expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );
	} );

	describe( "caching", function() {
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

		it( "should maintain the raw entity cache for reads", function( done ) {
			devices.ensureLoaded();
			$httpBackend.flush();
			expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 1 );
			expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

			devices.read( 2 )
				.then( function( device ) {
					expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 2 );
					expect( devices.entityCache ).to.be.an( "array" ).with.length( 2 );
				} )
				.then( done )
				.catch( done );
			$httpBackend.flush();
			$rootScope.$digest();
		} );

		it( "should maintain the raw entity cache for deletes", function( done ) {
			devices.ensureLoaded();
			$httpBackend.flush();
			expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 1 );
			expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

			devices.delete( {
					id : "1"
				} )
				.then( function() {
					expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 0 );
					expect( devices.entityCache ).to.be.an( "array" ).with.length( 0 );
				} )
				.then( done )
				.catch( done );
			$httpBackend.flush();
			$rootScope.$digest();
		} );

		it( "should maintain the raw entity cache for updates over socket", function() {
			devices.ensureLoaded();
			$httpBackend.flush();
			expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 1 );
			expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

			var updated = {
				id    : "1",
				name  : "My Updated Device",
				owner : "1"
			};

			devices.__onEntityReceived( null, updated );

			expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 1 );
			expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

			expect( devices.__entityCacheRaw.devices[ 0 ] ).to.eql( updated );
			expect( devices.entityCache[ 0 ] ).to.eql( updated );
		} );

		it( "should maintain the raw entity cache for deletes over socket", function() {
			devices.ensureLoaded();
			$httpBackend.flush();
			expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 1 );
			expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );

			var deleted = {
				id : "1"
			};

			devices.__onEntityReceived( null, deleted );

			expect( devices.__entityCacheRaw.devices ).to.be.an( "array" ).with.length( 0 );
			expect( devices.entityCache ).to.be.an( "array" ).with.length( 0 );
		} );
	} );

	describe( "reads", function() {
		it( "should provide an entity", function( done ) {
			devices.ensureLoaded();
			$httpBackend.flush();
			devices.read( "1" )
				.then( function( device ) {
					expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );
					expect( device ).to.be.an( "object" ).with.property( "name" ).that.equals( "My Device" );
				} )
				.then( done )
				.catch( done );
			$rootScope.$digest();
		} );

		it( "should provide an entity when collection is not loaded", function( done ) {
			devices.read( "1" )
				.then( function( device ) {
					expect( devices.entityCache ).to.be.an( "array" ).with.length( 1 );
					expect( device ).to.be.an( "object" ).with.property( "name" ).that.equals( "My Device" );
				} )
				.then( done )
				.catch( done );
			$httpBackend.flush();
		} );

		it( "should know which elements are in the index", function() {
			devices.ensureLoaded();
			$httpBackend.flush();
			expect( devices.has( "1" ) ).to.be.true;
			expect( devices.has( "nope" ) ).to.be.false;
		} );
	} );

	describe( "seeding", function() {
		it( "should provide seeded content", function( done ) {
			devices.seed( {
					devices : [ {
						id   : "1",
						name : "My Device"
					} ]
				}
			);

			devices.read( "1" )
				.then( function( device ) {
					expect( device ).to.be.an( "object" ).with.property( "name" ).that.equals( "My Device" );
				} )
				.then( done )
				.catch( done );
			$rootScope.$digest();
		} );

		it( "should provide updated content when syncing after seeding", function( done ) {
			var seed = {
				devices : [ {
					id   : "1",
					name : "My Device"
				} ]
			};

			devices.seed( seed );

			devices.sync();
			$httpBackend.flush();

			devices.read( "1" )
				.then( function( device ) {
					expect( device ).to.not.equal( seed.devices[ 0 ] );
				} )
				.then( done )
				.catch( done );
			$rootScope.$digest();
		} );
	} );

	describe( "populate complex", function() {
		it( "should populate referenced complex types", function( done ) {
			devices.read( "1" );
			$httpBackend.flush();

			devices.populateComplex( devices.entityCache[ 0 ], "owner", users )
				.then( function() {
					devices.entityCache[ 0 ].owner.should.equal( users.entityCache[ 0 ] );
				} )
				.then( done )
				.catch( done );

			$httpBackend.flush();
		} );

		it( "should populate referenced complex types and cross-link", function( done ) {
			users.ensureLoaded();
			devices.read( "1" );
			$httpBackend.flush();

			users.entityCache[ 0 ].devices = [];

			devices.populateComplex( devices.entityCache[ 0 ], "owner", users, {
					crossLink         : true,
					crossLinkProperty : "devices"
				} )
				.then( function() {
					devices.entityCache[ 0 ].owner.should.equal( users.entityCache[ 0 ] );
					users.entityCache[ 0 ].devices.should.be.an( "array" ).with.length( 1 );
					users.entityCache[ 0 ].devices[ 0 ].should.equal( devices.entityCache[ 0 ] );
				} )
				.then( done )
				.catch( done );

			$httpBackend.flush();
		} );
	} );

	describe( "lookup table", function() {
		it( "should provide an ID to entity lookup", function() {
			devices.ensureLoaded();
			$httpBackend.flush();
			var table = devices.lookupTableById();
			table[ "1" ].should.equal( devices.entityCache[ 0 ] );
		} );
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
