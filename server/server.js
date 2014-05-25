var express = require('express'),
    app = new express(),
    fs = require('fs'),
    http = require('http');

app.get('/', function (req, res) {
    var index = fs.readFileSync('../index.html', 'utf-8');
    res.send(index);
});

app.get('/iframe', function (req, res) {
    var iframe = fs.readFileSync('./iframe.html', 'utf-8');
    res.send(iframe);
});

app.get('/src', function (req, res) {
    var srcUrl = req.query.url;
    if (!srcUrl) {
        res.send(404, 'uncorrect source url, example: /src?url=xxx');
        return;
    }
    http.get(srcUrl, function(resp) {
        resp.on('data', function (data) {
            res.write(data); 
        });
        resp.on('end', function () {
            res.end();
        });
    }).on('error', function(e) {
        console.log("Got error: " + e.message);
        res.send(500, e.message);
    });

});

app.get('/inspector', function (req, res) {
    var script = fs.readFileSync('../script.js');
    res.setHeader('Content-type', 'application/javascript');
    res.send(script);
});

app.listen(3001);