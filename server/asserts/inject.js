/**
 * Entry of client script
 * @return {[type]} [description]
 */
;(function () {
    'use strict';
    var slice = Array.prototype.slice
    var clientId = '<%= clientId %>'
    var _requestHandlers = {}
    var dataPacketQueue = []
    var localBaseDocumentData
    var serverTime = <%= serverTime %>
    var clientTime = +new Date
    var differ, socket, anchor

    function fillURL(url) {
        if (/\w+:/.test(url)) return url
        if (url === null || url === undefined || url === '') return ''
        if (!anchor) anchor = document.createElement('a')
        anchor.href = url
        return (anchor.origin || '') + (anchor.pathname || '') + anchor.search
    }
    /**
     *  Get document html
     **/
    var lastOuterHTML
    function getDocument () {

        var doc = document.documentElement

        if (lastOuterHTML === doc.outerHTML) return null

        var scripts = slice.call(document.scripts)
        var links = slice.call(doc.querySelectorAll('link[rel="stylesheet"],a,link[rel="icon"]'))
        var styles = slice.call(doc.querySelectorAll('style'))
        var images = slice.call(doc.querySelectorAll('img'))
        var inputs = slice.call(doc.querySelectorAll('input,textarea'))
        var selects = slice.call(doc.querySelectorAll('select'))
        

        // avoid regexp match uncorrectly
        scripts.forEach(function (item) {
            if (!item.__jsinspecotr_fixed_url) {
                item.__jsinspecotr_fixed_url = 1
                if (item.getAttribute('src')) {
                    item.setAttribute('src', fillURL(item.src))
                }
                item.setAttribute('jsi-script', '')
            }
        });
        links.forEach(function (item) {
            if (item.__jsinspecotr_fixed_url) return
            item.__jsinspecotr_fixed_url = true
            item.setAttribute('href', fillURL(item.href || ''))
        });
        images.forEach(function (item) {
            if (item.__jsinspecotr_fixed_url) return
            item.__jsinspecotr_fixed_url = true
            item.setAttribute('src', fillURL(item.src))
        });
        styles.forEach(function (item) {
            if (item.innerHTML) {
                item.innerHTML = item.innerHTML.replace(
                    /url\(([\'\"])*[\/]*(?!http:\/\/|data:|https:\/\/)/g, 
                    'url($1' + window.location.protocol + '//' + window.location.host + '/'
                );
            }
        });
        inputs.forEach(function (item) {
            if (item.getAttribute('value') !== item.value) {
                item.setAttribute('value', item.value);
            }
        });
        selects.forEach(function (item) {
            var options = slice.call(item.querySelectorAll('option'));
            options.forEach(function (option) {
                if (item.value == option.value) {
                    option.setAttribute('selected', 'true');
                    return true;
                }
            });
        });
        // get document doctype
        var node = document.doctype
        var doctype = '<!DOCTYPE '
                        + node.name
                        + (node.publicId ? ' PUBLIC "' + node.publicId + '"' : '')
                        + (!node.publicId && node.systemId ? ' SYSTEM' : '') 
                        + (node.systemId ? ' "' + node.systemId + '"' : '')
                        + '>';

        var content = lastOuterHTML = doc.outerHTML
        content = content
                    // .replace(/<link\s[^\>]*?href="([^\"]+)"[^\>]*?\/?>/g, function (m, u) {
                    //     if (/\bjsi-link/.test(m)) {
                    //         var l = m.replace(/\bhref="[^\"]+"/, 'href="' + fillURL(u) + '"')
                    //         return l
                    //     } else return m
                    // })
                    .replace(/<script\s[^\>]*?>[\s\S]*?<\/script>/g, function (m) {
                        var l = m.match(/^<script\s[^\>]*?>/m)[0]
                        var scriptTypeReg = /\stype="(application|text)\/javascript"/m
                        if (!/\sjsi-script=/.test(l)) return m
                        m = m.replace(/\sjsi-script=""/, '')
                        if (/\stype="/.test(l) && !scriptTypeReg.test(l)) return m
                        else if (scriptTypeReg.test(l)) return m.replace(scriptTypeReg, function (n, t) {
                            return ' type="jsi-' + t + '\/javascript"'
                        })
                        else return m.replace(/^<script\b/, '<script type="jsi/javascript"')
                    })
        return doctype + content
    }

    /* =================================================================== */
    /**
     *  request and callback
     **/
    var requestId = 1
    function $send (options, success, error) {
        var id = requestId ++
        socket.emit('client:' + options.type, {
            pid: id, // packet id
            cid: clientId,
            data: options.data
        })
        /**
         *  register postMessage callback
         **/
        _requestHandlers[id] = {
            success: success,
            error: error
        };
    }

    /* =================================================================== */
    /**
     * Client inpspect ready
     */
    document.addEventListener('connectionReady', function (e) {
        socket = e.socket
        differ = jsondiffpatch.create({
            textDiff: {
                // default 60, minimum string length (left and right sides) 
                // to use text diff algorythm: google-diff-match-patch
                minLength: 256
            }
        });
        clientReady()
    });

    function clientReady () {
        /**
         *  receive server-side response 
         **/
        socket.on('server:answer:init:' + clientId, function (data) {
            var handler = _requestHandlers[data.pid]
            if (!handler) return
            delete _requestHandlers[data.pid]
            handler.success && handler.success(data.data)
        });
        socket.on('server:answer:update:' + clientId, function (data) {
            var handler = _requestHandlers[data.pid]
            if (!handler) return
            delete _requestHandlers[data.pid]
            handler.success && handler.success(data.data)
        });

        /**
         *  initialize step
         **/
        function documentInitalize (done) {
            var docHTML = getDocument()
            var uploadData = {
                browser: {
                    clientWidth: document.documentElement.clientWidth,
                    clientHeight: document.documentElement.clientHeight,
                    clientId: clientId,
                    userAgent: navigator.userAgent,
                    language: navigator.language,
                    platform: navigator.platform
                },
                html: docHTML,
                meta: {
                    scrollTop: document.body.scrollTop
                }
            }
            documentUpload(uploadData, done)
        }

        function documentUpload (data, cb) {
            initialSend(data, function () {
                localBaseDocumentData = data;
                cb && cb();
            }, function () {
                // if fail, retry
                documentUpload(data, cb);
            });
        }

        function initialSend (data, success, error) {
            $send({
                type: 'init',
                data: data,
            }, success, error);
        }
        /* =================================================================== */
        /**
         *  delta checking step
         **/
        function deltaCheckingStart () {

            dirtyChecking(function (dataPacket) {
                // call when check for the delta change
                dataPacket.meta.scrollElements = scrollMetas()
                sendToQueue(dataPacket);
            });

            consoleChecking(function (dataPacket) {
                dataPacket.meta.scrollElements = scrollMetas()
                sendToQueue(dataPacket);
            });

            window.addEventListener('hashchange', function () {
                var dataPacket = genDetalData();
                if (dataPacket) {
                    // update base document content
                    localBaseDocumentData.html = dataPacket.html;
                    // if delta exist, use it
                    if (dataPacket.delta) delete dataPacket.html;
                    // sync the meta
                    localBaseDocumentData.meta.scrollTop = dataPacket.meta.scrollTop
                    localBaseDocumentData.meta.scrollElements = scrollMetas()
                    // TODO
                    sendToQueue(dataPacket);
                }
            });
            window.addEventListener('scroll', function () {
                var dataPacket = {
                    meta: {
                        scrollTop: document.body.scrollTop,
                        scrollElements: scrollMetas()
                    }
                };
                sendToQueue(dataPacket);
            });

            var scrollElements = []
            function scrollMetas() {
                var nextSES = []
                var scrollMetas = []
                scrollElements.forEach(function (xpath) {
                    var el = document.querySelector(xpath)
                    if (el) {
                        nextSES.push(xpath)
                        scrollMetas.push({
                            xpath: xpath,
                            scrollTop: el.scrollTop
                        })
                    }
                })
                scrollElements = nextSES
                return scrollMetas
            }
            function elementPath(el) {
                var pn = el.parentNode
                var selector = []
                var tn
                while(pn) {
                    tn = el.tagName
                    var childs = pn.children
                    var nth
                    [].slice.call(childs).some(function (c, index) {
                        if (c == el) {
                            nth = index + 1
                            return true
                        }
                    })
                    selector.unshift(tn + ':nth-child(' + nth + ')')
                    if (pn !== document.body) {
                        el = pn
                        pn = el.parentNode
                    } else {
                        pn = null
                    }
                }
                return 'body>' + selector.join('>')
            }
            document.documentElement.addEventListener('scroll', function (e) {
                var tar = e.target
                var xpath = elementPath(tar)
                !~scrollElements.indexOf(xpath) && scrollElements.push(xpath)
                var dataPacket = {
                    meta: {
                        scrollElements: scrollMetas()
                    }
                }
                sendToQueue(dataPacket);
            }, true)
        }

        function dirtyChecking (hasDirtyCallback) {
            setTimeout(function() {
                var dataPacket = genDetalData();
                if (dataPacket) {
                    // update base document content
                    localBaseDocumentData.html = dataPacket.html;
                    if (dataPacket.delta) delete dataPacket.html;
                    // sync the meta
                    localBaseDocumentData.meta.scrollTop = dataPacket.meta.scrollTop
                    // dirty checking callback
                    hasDirtyCallback(dataPacket);
                }
                // polling
                dirtyChecking(hasDirtyCallback);
            }, 200);
        }

        function consoleChecking (hasConsoleCallback) {
            setTimeout(function() {
                var dataPacket;
                var consoles = window._jsinspector_consoles

                if (consoles.length > 0) {
                    dataPacket = {
                        meta: {
                            consoles: consoles,
                        }
                    }
                    window._jsinspector_consoles = []
                    hasConsoleCallback(dataPacket)
                }
                consoleChecking(hasConsoleCallback)
            }, 10)
        }
        /**
         *  Generate delta data when has dirty data, else if return null
         **/
        function genDetalData () {
            var checkedDoc = getDocument(),
                dirtyDataPacket;

            if (checkedDoc !== localBaseDocumentData.html) {
                dirtyDataPacket = {
                    html: checkedDoc,
                    time: new Date - (clientTime - serverTime),
                    delta: <%= delta %> ? differ.diff(localBaseDocumentData.html, checkedDoc) : null,
                    meta: {
                        scrollTop: document.body.scrollTop
                    }
                }
                // dirty checking callback
                return dirtyDataPacket;
            }

            return null;
        }

        function deltaPost (data, success, error) {
            $send({
                type: 'update',
                data: data
            }, success, error);
        }

        function sendToQueue (dataPacket) {
            dataPacketQueue.push(dataPacket);
            // trigger a event to notify queue manager
            onDataPacketPush();
        }

        /* =================================================================== */
        var queueProcessing = false;

        /**
         *  queue
         **/
        function onDataPacketPush () {
            // task queue manager is working now, lock
            if (queueProcessing) return
            queueProcess()
        }

        var MAX_RETRY_TIMES = 5
        var retryTimes = 0

        function queueProcess () {
            if (dataPacketQueue.length === 0) {
                // stop when the queue is empty
                queueProcessing = false;
                return;
            }
            queueProcessing = true;

            var taskData = dataPacketQueue[0];

            deltaPost(taskData, function () {
                // reset retry time
                retryTimes = 0;

                dataPacketQueue.shift();
                // aync for the performance
                setTimeout( function() {
                    queueProcess();
                }, 50);
                    
            }, function (err) {

                if (retryTimes >= MAX_RETRY_TIMES) { // max retry times
                    alert(err || 'network error!');
                } else { // retry
                    retryTimes ++;
                    setTimeout( function() {
                        queueProcess();
                    });
                }
            });
        }
        // document base content initial upload
        documentInitalize(function () {
            // delta upload after base document upload done
            deltaCheckingStart();
        });
    }
    
})();
