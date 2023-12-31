var express = require('express');
var app = express();
app.get('/', function (req, res) {
  res.send('Hello World!');
});


const PORT = process.env.PORT || 8000; 
app.listen(PORT, () => { console.log(`App listening on port ${PORT}!`); });

module.exports = app;
