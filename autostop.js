// ==UserScript==
// @name Autostop
// @description Autoplay sucks, even on youtube
// @namespace github.com/seebye/autostop
// @match <all_urls>
// @run-at document-start
// ==/UserScript==
/*
Copyright (C) 2017  Nico Baeurer

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

(function() {
	"use strict";

	let playable = false;
	let proto = (() => {
		let iframe = document.createElement('iframe');
		let protos = {};

		try {
			iframe.sandbox = 'allow-same-origin';
			document.documentElement.insertBefore(iframe, document.documentElement.firstChild);

			for (let i of Object.getOwnPropertyNames(iframe.contentWindow)) {
				try {
					protos[i] = iframe.contentWindow[i].prototype;
				}
				catch (e) {
					// some members are still protected (cross origin)
				}
			}

			return protos;
		}
		finally {
			document.documentElement.removeChild(iframe);
		}
	})();


	let accessUnmodified = function(target, cb) {
		let tmp = target.__proto__;

		try {
			target.__proto__ = proto[tmp.constructor.name];
			return cb(target);
		}
		finally {
			target.__proto__ = tmp;
		}
	};


	let hook = function(proto) {
		let helper = {};

		for (let member in proto) {
			try {
				if (proto[member] instanceof Function) {
					helper[member] = {
						override: function(creator) {
							proto[member] = creator(proto[member]);
							return helper;
						}
					};
				}
			}
			catch (e) {
				helper[member] = {
					property: function({getter, setter=() => {}}) {
						Object.defineProperty(proto, member, {
							get: getter,
							configurable: false,
							enumerable: true,
							set: setter
						});
						return helper;
					},
					constant: function(val) {
						Object.defineProperty(proto, member, {
							value: val,
							configurable: false,
							enumerable: true
						});
						return helper;
					}
				};
			}
		}

		return helper;
	};


	let disableAutoplay = function(target) {
		for (let v of target.getElementsByTagName('video')) {
			v.pause();
		}
	};


	let onceTrustedEvent = function(target, ev, cb) {
		target.addEventListener(ev, (() => {
			let listener = (e) => {
				if (e.isTrusted) {
					target.removeEventListener(ev, listener);
					cb(e);
				}
			};
			return listener;
		})());
	};


	let init = (function() {
		onceTrustedEvent(document, "click", (e) => {
			playable = true;
		});

		hook(window.HTMLMediaElement.prototype)
			// block javascript code from playing a video till the first user interaction
			.play.override((orig) => function() {
					try {
						return orig.apply(this);
					}
					finally {
						// pause video instead of block calling play
						// (e.g. youtube produces a high load otherwise..)
						if (!playable) {
							this.pause();
						}
					}
				})
			// block javascript code from enabling autoplay
			.autoplay.property({getter: function() {
				return accessUnmodified(this, (self) => self.autoplay);
			}});

		// disable autoplay via html attribute
		hook(window.Element.prototype)
			.innerHTML.property({
				getter: function() {
					return accessUnmodified(this, (self) => self.innerHTML);
				},
				setter: function(val) {
					accessUnmodified(this, (self) => {
						self.innerHTML = val;
					});
					
					disableAutoplay(this);
				}});

		document.addEventListener("DOMContentLoaded", (e) => {
			disableAutoplay(document);
		}, {once: true});
	})();
})();

