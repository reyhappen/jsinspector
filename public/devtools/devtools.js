!(function () {
    var slice = Array.prototype.slice,
        socket = io.connect('<%= host %>'),
        inspectorId = '<%= inspectorId %>',
        inspectedWindow = document.querySelector('#inspectedWindow'),
        documentBase = '',
        isDocumentInited = false,
        jdpInstance = jsondiffpatch.create({
            textDiff: {
                maxLength: 60
            }
        });

    function updateFrameHeight () {
        inspectedWindow.style.height = inspectedWindow.contentDocument.body.scrollHeight + 'px';
    }
    /**
     *  update inspected device view
     **/
    function updateinspectedWindow (data) {

        var ispDoc = inspectedWindow.contentDocument,
            ispWin = inspectedWindow.contentWindow;

        if (data.html) { // full amount download
            documentBase = data.html;
            writeDocument(ispDoc, ispWin, documentBase);
        } else if (data.delta) { // delta download
            documentBase = jdpInstance.patch(documentBase, data.delta);
            writeDocument(ispDoc, ispWin, documentBase);
        }
        updateFrameHeight();
        if (data.meta.scrollTop !== undefined) {
            // update some metas only
            window.scrollTo(0, data.meta.scrollTop);
        }
    }
    /**
     *  Write iframe document
     **/
    function writeDocument (ispDoc, ispWin, html) {
        ispDoc.open();
        // remove inspector CORS frame src and save dom for Xpath
        html = html.replace(/<iframe\s*src="[^"]*"\s*id="__jsinspector_cors_iframe"/, 
            '<iframe src="" id="__jsinspector_cors_iframe"');
        ispDoc.write(html);
        ispDoc.close();

        /**
         *  Sync the view port from the iframe
         **/
        var viewport = slice.call(ispDoc.querySelectorAll('meta[name="viewport"]') || []);
        viewport.forEach(function (item) {
            document.head.appendChild(item.cloneNode(true));
        });
    }
    /**
     *  Get init document content from jsinpsctor server as base document for delta download
     **/
    function getInitDocument (success, error) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (xhr.readyState == 4 && xhr.status == 200 && xhr.responseText) {
                success && success(xhr.responseText, xhr);
            } else if (xhr.readyState == 4 && xhr.status != 200) {
                error && error(xhr.response, xhr);
            }
        }
        xhr.open('GET', '/devtools/init?<%= inspectorId %>');
        xhr.send(null);
    }
    /**
     *  Initialize function for get full document text
     **/
    var MAX_RETRY_TIMES = 5,
        retryTimes = 0;

    function initialize () {
        getInitDocument (function (data) {
            isDocumentInited = true;
            documentBase = data.html;
            updateinspectedWindow(JSON.parse(data));

            // receive document sync data
            socket.on('inspected:html:update:<%= inspectorId %>', function (data) {
                data = JSON.parse(data);
                updateinspectedWindow(data);
            });

        }, function (err, xhr) {
            if (xhr.status == 404) {
                alert(err);
            } else if (retryTimes >= MAX_RETRY_TIMES) {
                alert(err);
            } else {
                initialize();
            }
        });
    }

    /**
     *  initialize after window load
     **/
    window.addEventListener('load', function () {
        updateFrameHeight();
        initialize();
    });
})();