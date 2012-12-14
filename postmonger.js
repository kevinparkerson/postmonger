/*
 * Postmonger.js   version 0.0.9
 * https://github.com/kevinparkerson/postmonger
 *
 * Copyright (c) 2012 Kevin Parkerson
 * Available via the MIT or new BSD license.
 * Further details and documentation:
 * http://kevinparkerson.github.com/postmonger/
 *
 *///

(function(root, factory){
    if(typeof define === 'function' && define.amd) {
        define([], factory);
    }else {
        root.Postmonger = factory(root);
    }
}(this, function(root){
    var exports = exports || undefined;
    var Postmonger;
    var previous = root.Postmonger;
    var _window = (root.addEventListener) ? root : window;
    var Connection, Events, Session;

    //Set up Postmonger namespace, provide noConflict support, and version
    if (typeof(exports) !== 'undefined') {
        Postmonger = exports;
    } else {
        Postmonger = {};
    }
    Postmonger.noConflict = function(){
        root.Postmonger = previous;
        return this;
    };
    Postmonger.version = '0.0.10';

    //Create a new Postmonger Connection
    Connection = Postmonger.Connection = function(options){
        options = (typeof(options)==='object') ? options : {};

        var connect = options.connect || _window.parent;
        var from = options.from || '*';
        var to = options.to || '*';
        var self = this;

        //If string, grab based on id
        if(typeof(connect)==='string'){
            connect = document.getElementById(connect);
        }

        //If no connection, check for jquery object
        if(connect && !connect.postMessage && connect.jquery){
            connect = connect.get(0);
        }

        //If still no connection, check for iframe
        if(connect && !connect.postMessage && (connect.contentWindow || connect.contentDocument)){
            connect = connect.contentWindow || connect.contentDocument;
        }

        //Throw warning if connection could not be made
        if(!(connect && connect.postMessage)){
            if(_window.console && _window.console.warn){
                _window.console.warn(' Warning: Postmonger could not establish connection with ', options.connect);
            }
            return false;
        }

        self.connect = connect;
        self.to = to;
        self.from = from;

        return self;
    };

    //Postmonger.Events - Hacked together from Backbone.Events and two Underscore functions.
    Events = Postmonger.Events = function(){
        var eventSplitter = /\s+/;
        var self = this;

        self._callbacks = {};

        self._has = function(obj, key){
            return Object.prototype.hasOwnProperty.call(obj, key);
        };

        self._keys = function(obj){
            if(Object.keys){
                return Object.keys(obj);
            }

            if (typeof(obj)!=='object'){
                throw new TypeError('Invalid object');
            }

            var keys = [];

            for(var key in obj){
                if (self._has(obj, key)) {
                    keys[keys.length] = key;
                }
            }

            return keys;
        };

        self.on = function(events, callback, context){
            var calls, event, node, tail, list;

            if(!callback){
                return self;
            }

            events = events.split(eventSplitter);

            self._callbacks = self._callbacks || {};
            calls = self._callbacks;

            while (event = events.shift()) {
                list = calls[event];

                node = (list) ? list.tail : {};
                tail = {};

                node.next = tail;
                node.context = context;
                node.callback = callback;

                calls[event] = {
                    tail: tail,
                    next: (list) ? list.next : node
                };
            }

            return self;
        };

        self.off = function(events, callback, context){
            var calls = self._callbacks;
            var event, node, tail, cb, ctx;

            if(!calls){
                return;
            }

            if(!(events || callback || context)){
                delete self._callbacks;
                return self;
            }

            events = (events) ? events.split(eventSplitter) : self._keys(calls);

            while (event = events.shift()) {
                node = calls[event];
                delete calls[event];
                if (!node || !(callback || context)) {
                    continue;
                }

                tail = node.tail;
                while ((node = node.next) !== tail) {
                    cb = node.callback;
                    ctx = node.context;
                    if (((callback && cb) !== callback) || ((context && ctx) !== context)) {
                        self.on(event, cb, ctx);
                    }
                }
            }

            return self;
        };

        self.trigger = function(events){
            var event, node, calls, tail, args, all, rest;

            if (!(calls = self._callbacks)) {
                return self;
            }

            all = calls.all;
            events = events.split(eventSplitter);
            rest = Array.prototype.slice.call(arguments, 1);

            while (event = events.shift()) {
                if (node = calls[event]) {
                    tail = node.tail;
                    while ((node = node.next) !== tail) {
                        node.callback.apply(node.context || self, rest);
                    }
                }
                if (node = all) {
                    tail = node.tail;
                    args = [event].concat(rest);
                    while ((node = node.next) !== tail) {
                        node.callback.apply(node.context || self, args);
                    }
                }
            }

            return self;
        };

        return self;
    };

    //Create a new Postmonger Session
    Session = Postmonger.Session = function(){
        var addEventListener = _window.addEventListener || _window.attachEvent;
        var args = (arguments.length>0) ? Array.prototype.slice.call(arguments, 0) : [{}];
        var connections = {};
        var froms = {};
        var incoming = new Events();
        var outgoing = new Events();
        var removeEventListener = _window.removeEventListener || _window.detachEvent;
        var self = this;
        var connection, i, l, key, postMessageListener;

        //Session API hooks
        self.on = incoming.on;
        self.off = incoming.off;
        self.trigger = outgoing.trigger;
        self.end = function(){
            incoming.off();
            outgoing.off();
            removeEventListener('message', postMessageListener, false);
            return self;
        };

        //Establishing connections
        for(i=0, l=args.length; i<l; i++){
            connection = new Connection(args[i]);
            if(connection){
                key = 'f: ' + connection.from + '  t: ' + connection.to;
                if(!(connections[key] && (connections[key].connect === connection.connect))){
                    connections[key] = connection;
                    froms[connection.from] = true;
                }
            }
        }

        //Throw warning if window.addEventListener could not be found
        if(!addEventListener){
            if(_window.console && _window.console.warn){
                _window.console.warn(' Warning: Postmonger could not listen for messages on this window.');
            }
            return false;
        }

        //Listener for incoming messages
        postMessageListener = function(event){
            var message = [];
            var data;
            var k;

            try{
                data = JSON.parse(event.data);
            }catch(e){
                return false;
            }

            if(!froms['*'] && !froms[event.origin]){
                return false;
            }

            if(!data.e){
                return false;
            }
            message.push(data.e);
            delete data.e;

            for(k in data){
                message.push(data[k]);
            }

            incoming['trigger'].apply(root,message);
        };
        //Add the listener
        _window.addEventListener('message', postMessageListener, false);

        //Sending outgoing messages
        outgoing.on('all', function(){
            var args = Array.prototype.slice.call(arguments, 0);
            var message = {};
            var k;

            message.e = args.shift();

            for(i=0, l=args.length; i<l; i++){
                message['z' + (i+1)] = args[i];
            }

            for(k in connections){
                connections[k].connect.postMessage(JSON.stringify(message), connections[k].to);
            }
        });

        return self;
    };

    return Postmonger;
}));
