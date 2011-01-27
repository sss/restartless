/**
 * @fileOverview Configuration dialog module for restartless addons
 * @author       SHIMODA "Piro" Hiroshi
 * @version      3
 *
 * @license
 *   The MIT License, Copyright (c) 2011 SHIMODA "Piro" Hiroshi.
 *   http://www.cozmixng.org/repos/piro/restartless-addon/trunk/license.txt
 * @url http://www.cozmixng.org/repos/piro/restartless-addon/trunk/
 */

const EXPORTED_SYMBOLS = ['config'];

/**
 * @class
 *   Provides features to manage custom configuration dialog.
 */
var config = {
	_configs : {},

	/**
	 * Opens a registered dialog bound to the given URI as a "non-modal"
	 * window. If there is existing window, then focus to it.
	 *
	 * @param {String} aURI
	 *   A URI which is bould to any configuration dialog.
	 *
	 * @returns {nsIDOMWindow}
	 *   The window object of the configuration dialog.
	 */
	open : function(aURI)
	{
		aURI = this._resolveResURI(aURI);
		if (!(aURI in this._configs))
			return null;

		var current = this._configs[aURI];

		if (current.openedWindow && !current.openedWindow.closed) {
			current.openedWindow.focus();
			return current.openedWindow;
		}

		var title = Cc['@mozilla.org/variant;1']
						.createInstance(Ci.nsIWritableVariant);
		title.setFromVariant(current.title);
		var content = Cc['@mozilla.org/variant;1']
						.createInstance(Ci.nsIWritableVariant);
		content.setFromVariant(current.content);
		var args = Cc['@mozilla.org/supports-array;1']
						.createInstance(Ci.nsISupportsArray);
		args.AppendElement(title);
		args.AppendElement(content);

		current.openedWindow = Cc['@mozilla.org/embedcomp/window-watcher;1']
							.getService(Ci.nsIWindowWatcher)
							.openWindow(
								null,
								'data:application/vnd.mozilla.xul+xml,'+encodeURIComponent(
									'<?xml version="1.0"?>\n'+
									'<!-- ' + current.originalURI + ' -->\n'+
									'<?xml-stylesheet href="chrome://global/skin/"?>\n'+
									current.container
								),
								'_blank',
								'chrome,titlebar,toolbar,centerscreen' +
								(Prefs.getBoolPref('browser.preferences.instantApply') ?
									',dialog=no' :
									''// ',modal'
								),
								args
							);
		current.openedWindow.addEventListener('load', function() {
			current.openedWindow.removeEventListener('load', arguments.callee, false);
			current.openedWindow._sourceURI = aURI;
			current.openedWindow.addEventListener('unload', function() {
				current.openedWindow.removeEventListener('unload', arguments.callee, false);
				current.openedWindow = null;
			}, false);
		}, false);
		return current.openedWindow;
	},

	/**
	 * Registers a source code of a XUL document for a configuration dialog
	 * to the given URI. It is used by open().
	 *
	 * @param {String} aURI
	 *   A URI which is the target URI. When the URI is loaded in a browser
	 *   window, then this system automatically opens a generated XUL window
	 *   from the source.
	 * @param {XML} aXML
	 *   A source of a XUL document for a configuration dialog defined as an
	 *   E4X object (XML object). Typical headers (<?xml version="1.0"?> and
	 *   an <?xml-stylesheet?> for the default theme) are automatically added.
	 */
	register : function(aURI, aXML)
	{
		var content = aXML.*;
		var container = aXML.copy();
		var title = aXML[0].@title;
		delete container.*;
		delete container.@title;
		container.script = <script type="application/javascript"><![CDATA[
			document.documentElement.setAttribute('title', arguments[0]);
			var range = document.createRange();
			range.selectNodeContents(document.documentElement);
			range.collapse(true);
			document.documentElement.appendChild(range.createContextualFragment(arguments[1]));
			range.detach();
		]]></script>;
		this._configs[this._resolveResURI(aURI)] = {
			originalURI  : aURI,
			title        : title.toString(),
			content      : content.toXMLString(),
			container    : container.toString(),
			openedWindow : null
		};
	},

	/**
	 * Unregisters a registeed dialog for the given URI.
	 *
	 * @param {String} aURI
	 *   A URI which have a registered dialog.
	 */
	unregister : function(aURI)
	{
		delete this._configs[this._resolveResURI(aURI)];
	},

	/**
	 * Unregisters a default value for the preference.
	 *
	 * @param {String} aKey
	 *   A key of preference.
	 * @param {nsIVariant} aValue
	 *   The default value. This must be a string, integer, or boolean.
	 */
	setDefault : function(aKey, aValue)
	{
		switch (typeof aValue)
		{
			case 'string':
				return DefaultPrefs.setCharPref(aKey, unescape(encodeURIComponent(aValue)));

			case 'number':
				return DefaultPrefs.setIntPref(aKey, parseInt(aValue));

			default:
				return DefaultPrefs.setBoolPref(aKey, !!aValue);
		}
	},

	observe : function(aSubject, aTopic, aData)
	{
		var uri = aSubject.location.href;
		if (
			uri == 'about:addons' ||
			uri == 'chrome://mozapps/content/extensions/extensions.xul' // Firefox 3.6
			) {
			this._onLoadManager(aSubject);
			return;
		}

		uri = this._resolveResURI(uri);
		if (uri in this._configs) {
			aSubject.setTimeout('window.close();', 0);
			this.open(uri);
		}
	},

	_resolveResURI : function(aURI)
	{
		if (aURI.indexOf('resource:') == 0)
			return ResProtocolHandler.resolveURI(IOService.newURI(aURI, null, null));
		return aURI;
	},

	handleEvent : function(aEvent)
	{
		switch (aEvent.type)
		{
			case 'unload':
				this._onUnloadManager(aEvent.currentTarget);
				return;

			case 'command':
				let target = aEvent.originalTarget;
				let uri;
				if (target.getAttribute('anonid') == 'preferences-btn' ||
					target.id == 'cmd_showItemPreferences')
					uri = target.ownerDocument.defaultView
							.gViewController
							.currentViewObj
							.getSelectedAddon()
							.optionsURL;
				else if (target.id == 'cmd_options') // Firefox 3.6
					uri = target.ownerDocument.defaultView
							.gExtensionsView
							.currentItem
							.getAttribute('optionsURL');
				if (uri &&
					(uri = this._resolveResURI(uri)) &&
					uri in this._configs) {
					this.open(uri);
					aEvent.stopPropagation();
					aEvent.preventDefault();
				}
				return;
		}
	},
	_onLoadManager : function(aWindow)
	{
		aWindow.addEventListener('command', this, true);
		aWindow.addEventListener('unload', this, true);
		this._managers.push(aWindow);
	},
	_onUnloadManager : function(aWindow)
	{
		aWindow.removeEventListener('command', this, true);
		aWindow.removeEventListener('unload', this, true);
		this._managers.splice(this._managers.indexOf(aWindow), 1);
	},
	_managers : []
};

var Prefs = Cc['@mozilla.org/preferences;1']
						.getService(Ci.nsIPrefBranch);
var DefaultPrefs = Cc['@mozilla.org/preferences-service;1']
						.getService(Ci.nsIPrefService)
						.getDefaultBranch(null);

var IOService = Cc['@mozilla.org/network/io-service;1']
						.getService(Ci.nsIIOService);
var ResProtocolHandler = IOService
						.getProtocolHandler('resource')
						.QueryInterface(Ci.nsIResProtocolHandler);

var ObserverService = Cc['@mozilla.org/observer-service;1']
						.getService(Ci.nsIObserverService);
ObserverService.addObserver(config, 'chrome-document-global-created', false);
ObserverService.addObserver(config, 'content-document-global-created', false);

var WindowMediator = Cc['@mozilla.org/appshell/window-mediator;1']
						.getService(Ci.nsIWindowMediator)
let (managers = WindowMediator.getEnumerator('Addons:Manager')) {
	while (managers.hasMoreElements())
	{
		config._onLoadManager(managers.getNext().QueryInterface(Ci.nsIDOMWindow));
	}
}
let (browsers = WindowMediator.getEnumerator('navigator:browser')) {
	while (browsers.hasMoreElements())
	{
		let browser = browsers.getNext().QueryInterface(Ci.nsIDOMWindow);
		Array.slice(browser.gBrowser.mTabContainer.childNodes)
			.forEach(function(aTab) {
			if (aTab.linkedBrowser.currentURI.spec == 'about:addons')
				config._onLoadManager(aTab.linkedBrowser.contentWindow);
		});
	}
}
let (managers = WindowMediator.getEnumerator('Extension:Manager')) { // Firefox 3.6
	while (managers.hasMoreElements())
	{
		config._onLoadManager(managers.getNext().QueryInterface(Ci.nsIDOMWindow));
	}
}

function shutdown()
{
	var windows = WindowMediator.getEnumerator(null);
	while (windows.hasMoreElements())
	{
		let window = windows.getNext().QueryInterface(Ci.nsIDOMWindow);
		if (window._sourceURI && window._sourceURI in config._configs)
			window.close();
	}

	config._managers.forEach(config._onUnloadManager, config);

	ObserverService.removeObserver(config, 'chrome-document-global-created');
	ObserverService.removeObserver(config, 'content-document-global-created');

	Prefs = void(0);
	DefaultPrefs = void(0);
	IOService = void(0);
	ResProtocolHandler = void(0);
	ObserverService = void(0);
	WindowMediator = void(0);

	config._configs = void(0);
	config._managers = void(0);
	config = void(0);
}
