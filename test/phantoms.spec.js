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

	beforeEach( inject( function( _devices_, _users_ ) {
		devices = _devices_;
		devices.reset();

		users = _users_;
		users.reset();
	} ) );

	describe( "phantoms", function() {
		it( "should insert a phantom into the cache", function() {
			devices.ensureLoaded();
			$httpBackend.flush();

			devices.phantom( {
				id   : 0,
				name : "foo"
			} );
			$rootScope.$digest();
			devices.has( 0 ).should.be.true;
		} );

		it( "resulting promise should be resolved instantly if no timeout is given", function( done ) {
			devices.ensureLoaded();
			$httpBackend.flush();

			devices.phantom( {
					id   : 0,
					name : "foo"
				} )
				.then( function() {
					done();
				} );
			$rootScope.$digest();
		} );

		it( "resulting promise should be resolved after receiving update", function( done ) {
			devices.ensureLoaded();
			$httpBackend.flush();

			devices.phantom( {
					id   : 0,
					name : "foo"
				}, 300 )
				.then( function( entity ) {
					entity.webstorm.should.equal( "sucks" );
					done();
				} );
			$rootScope.$digest();

			devices.__onEntityOnWebsocket( {
				device : {
					id       : 0,
					name     : "foo",
					webstorm : "sucks"
				}
			} );
			$rootScope.$digest();
		} );

		it( "resulting promise should be resolved rejected after timeout", function( done ) {
			devices.ensureLoaded();
			$httpBackend.flush();

			devices.phantom( {
					id   : 0,
					name : "foo"
				}, 300 )
				.then( undefined, function() {
					done();
				} );
			$rootScope.$digest();
			setTimeout( function() {
				$rootScope.$digest();
			}, 400 );

		} );
	} );
} );
