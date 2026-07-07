/**
 *
 */
function GlobalObj () {
	this.PLATFORM = PORT.APPLOVIN;
	this.androidLink = ''; // Google Play Store Link
	this.iosLink = '';		// iTunes Store Link
	
	
	this.iteration = 0; // Int, this is what the playable uses to determine logic. Up to dev to implement how the iteration is handled. Starting at 0.
	this.maxIteration = 3; // Int, max (inclusive) iterations. Used by build script to auto generate the other iterations. Default is 0 (i.e 1 iteration total).
	this.sipIteration = 2; // At which point in the list of iterations are they SIP iterations. Iteration 1 and all iterations after are flagged as "SIPs". 
							// Used just to make auto filename changing work in build script (i.e change mip to sip). If no SIP, simply set it above maxIteration like shown.
	this.isSIP = (this.iteration >= this.sipIteration);
	// set to true to force renderer to use Canvas instead of WebGL for iOS
	// Set true only if experiencing lag issues with iOS, else keep it false
	this.forceCanvasIOS = false;
	
	// First state not including orientation postfix
	this.firstState = "Level";
	// if set to true the system will expect 2 state, one per orientation
	// with the naming convention of LevelName_p / LevelName_l
	this.isSeparateOrientationState = true;
	
	this.orientation = "p";
	this.LangCode = 'EN';
	this.debugPress = {one:0,shift:0,ctrl:0};
	this.geoDic = {};
	this.webfontGEOTextObjs = [];
	// GEO image
	this.GEOImageObjs = [];
	this.isGEOImageAutodetectForceOff = false;	// if true it will disable all GEO Image texture key autodetection, everything is assumed to be manually specified
	
	/*this.isGEOImageAutodetectStrict = true;		// if true GEO img autodetect will only run on GEOImg objects that don't have any of their data changed
												// e.g. if you manually specified a filename for CN_S, but left FR empty, it will not try to find an autodetect value for FR
												// as it considers you leaving that empty was on puropse.*/
												//
												// In other words, if true it will only do autodetect for the 
												// GEOImg objects that have no filenames manually specified for any language
	this.isGEOImageVerboseLogging = false;		// If true it will enable verbose logging for geo images. If you run into any trouble with GEO images
												// enabling this and showing the log will help resolve the issue
	
	this.ButtonObjs = [];
	this.customDebugButtons = [];
	this.webfonts = ["Arial"]; // Add each webfont name | Example - ['impactregular','keep_calm_medregular'];
	this.currScalingMode = "";
	this.myStates = {Level_p:Level_p,Level_l:Level_l};
	this.prevWindowHeight = 0; //window.innerHeight;
	this.prevWindowWidth = 0; //window.innerWidth;
	
	this.cameraOffsetX = 0;
	this.cameraOffsetY = 0;
	this.anchoredObjects = [];
	
}
GlobalObj.prototype.create = function(){
	
};

const PORT = {
		APPLOVIN: 1,
		IRONSOURCE: 2,
		FACEBOOK: 3,
		TIKTOK: 4,
		GOOGLE: 5,
		UNITY: 6,
		VUNGLE: 7,
		MAIO: 8,
		MINTEGRAL: 9,
		LIFTOFF: 10,
		CHARTBOOST: 11,
		APPGROWTH: 12,
};

const Anchor = {
		H_LEFT: 1,
		H_NONE: 2,
		H_RIGHT: 3,
		V_TOP: 4,
		V_NONE: 5,
		V_BOTTOM: 6,
};

const templateVersion 	= "V1.23";
const templateDate		= "8/28/23";