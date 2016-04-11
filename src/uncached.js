/* globals angular */

angular
	.module( "absync" )
	.filter( "absyncUncached", uncachedFilterProvider );

function uncachedFilterProvider() {
	return uncachedFilter;

	function uncachedFilter( url ) {
		if( !url ) {
			return url;
		}

		var delimiter     = -1 < url.indexOf( "?" ) ? "&" : "?";
		var discriminator = new Date().getTime();
		
		return url + delimiter + "t" + discriminator;
	}
}
