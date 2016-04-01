(function() {
"use strict";
/* globals angular */

angular
	.module( "absync" )
	.constant( "absyncNoopLog", {
		debug : angular.noop,
		info  : angular.noop,
		error : angular.noop
	} );
}());