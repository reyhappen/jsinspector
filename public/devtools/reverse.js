/**
 *  reverse inject script to client side
 **/
!function (exports) {
    'use strict;'

    function commander () {
        var args = Array.prototype.slice.call(arguments);
        var command = args.shift();
        while (args.length) {
            command = command.replace(/%s/, args.shift())
        }
        return command;
    }
    var inject = function () {
        var command = commander.apply(null, arguments)
        inject.push({
            type: 'eval',
            value: command
        })
    }

    inject.commands = []

    /**
     *  access
     **/
    inject.clear = function () {
        inject.commands = []
    }
    inject.push = function (payload) {
        // payload = JSON.stringify(payload)
        inject.commands.push(payload)
        handlers.forEach(function (h) {
            h.call(null, payload)
        })
    }

    /**
     *  events
     **/
    var handlers = []
    inject.on = function (handler) {
        handlers.push(handler)
    }
    /**
     *  resources
     **/
    inject.js = function () {
        var args = Array.prototype.slice.call(arguments);
        inject.push({
            type: 'js',
            value: args
        })
    }
    inject.css = function () {
        var args = Array.prototype.slice.call(arguments);
        inject.push({
            type: 'css',
            value: args
        })
    }
    exports.inject = inject;
    
}(window);