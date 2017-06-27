'use strict'

const EventEmitter = require('events').EventEmitter
const I18n = require('./i18n')
const Logger = require('./logger')
const Store = require('./store')

/**
 * This is the minimal class that all parts of the click-to-dial
 * application inherit from(tab, contentscript, background, popup/out).
 * It sets some basic properties that can be reused, like a logger, store,
 * an IPC eventemitter and some environmental properties.
 */
class Skeleton extends EventEmitter {

    constructor(options) {
        super()
        this.cache = {}
        this._listeners = 0
        this.utils = require('./utils')
        this.env = this.getEnvironment(options.environment)
        this.modules = {}

        this.name = options.name
        this.store = new Store(this)
        this.i18n = new I18n(this)
        this.logger = new Logger()

        this._init()
        // Init these modules.
        for (let module of options.modules) {
            this.modules[module.name] = new module.Module(this)
        }

        // Increases verbosity beyond the logger's debug level.
        this.verbose = false
        // Sets the verbosity of the logger.
        this.logger.setLevel('debug')
        this.logger.debug(`${this} init`)


        if (this.browser && this.browser.extension && !this.env.extension.observer) {
            // Make the EventEmitter .on method compatible with web extension ipc.
            // An Ipc event is coming in. Map it to the EventEmitter.
            this.browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.data) {
                    // Add extra contextual information about sender to the payload.
                    request.data.sender = sender
                    // It may have a callback, but functions can't pass through
                    // the request.data, so map sendResponse.
                    request.data.callback = sendResponse
                }
                // Only emit
                this.emit(request.event, request.data, true)
            })

            // Allows parent scripts to use the same EventEmitter syntax.
            if (this.env.extension && this.env.extension.tab) {
                this.logger.info(`${this} added plain message listener`)
                window.addEventListener('message', (e) => {
                    if (this.verbose) this.logger.debug(`${this}${e.data.event} triggered from child frame`)
                    this.emit(e.data.event, e.data.data, true)
                })
            }
        }
    }

    /**
     * This method may be overriden to initialize logic before loading
     * modules, e.g. like initializing a sip stack.
     */
    _init() {

    }


    /**
     * Use `app.devMode`to do more things when in dev mode.
     */
    get devMode() {
        return !('update_url' in this.browser.runtime.getManifest())
    }


    /**
     * Modified emit method which makes it compatible with web extension ipc.
     * Without tabId or parent, the event is emitted on the runtime, which
     * includes listeners for the popout and the background script. The tabId
     * or the parent are specific when an event needs to be emitted on
     * either a tab content script or from a loaded tab content script to
     * it's parent.
     */
    emit(event, data = {}, noIpc = false, tabId = false, parent = false) {

        if (this.browser.extension && !noIpc) {
            let payloadArgs = []
            let payloadData = {event: event, data: data}
            payloadArgs.push(payloadData)

            if (tabId) {
                this.browser.tabs.sendMessage(tabId, payloadData)
                return
            } else if (parent) {
                parent.postMessage({
                    event: event,
                    data: data,
                }, '*')
                return
            }

            if (data && data.callback) {
                payloadArgs.push(data.callback)
            }
            this.browser.runtime.sendMessage(...payloadArgs)
        } else {
            super.emit(event, data)
        }
    }


    /**
     * Sets environmental properties, used to distinguish between
     * webextension, regular webapp or Electron app.
     * @param {Object} environment - The environment properties passed to the Constructor.
     */
    getEnvironment(environment) {
        // If browser exists, use browser, otherwise take the Chrome API.
        if ('browser' in global) {
            this.browser = browser
        } else if ('chrome' in global) {
            this.browser = chrome
        } else {
            this.browser = null
        }
        if (environment.extension) {
            let searchParams = this.utils.parseSearch(location.search)
            if (searchParams.popout) {
                environment.extension.popout = true
            } else {
                environment.extension.popout = false
            }
            if (global.chrome) {
                environment.extension.isChrome = true
                environment.extension.isFirefox = false
            } else {
                environment.extension.isChrome = false
                environment.extension.isFirefox = true
            }
        }

        return environment
    }


    on(event, callback) {
        this._listeners += 1
        super.on(event, callback)
    }


    toString() {
        return `[${this.name}]`
    }
}

module.exports = Skeleton